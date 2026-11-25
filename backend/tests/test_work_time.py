"""Real replica-set integration tests; never connect to deployment databases."""
import asyncio
import os
import uuid
from datetime import datetime, timedelta, timezone
from contextlib import asynccontextmanager

import httpx
import pytest
from fastapi import APIRouter, FastAPI, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorClient
from test_deployment import server
import work_time

ACTORS = {
 'owner': {'user_id':'owner', 'company_id':'a', 'role':'owner', 'full_name':'Owner'},
 'member': {'user_id':'member', 'company_id':'a', 'role':'member', 'full_name':'Member'},
 'viewer': {'user_id':'viewer', 'company_id':'a', 'role':'viewer'},
 'outsider': {'user_id':'outsider', 'company_id':'b', 'role':'owner'},
}
T0 = datetime(2026, 1, 2, 8, tzinfo=timezone.utc)
def op(**data): return {'operation_id': uuid.uuid4().hex, **data}

@asynccontextmanager
async def harness(monkeypatch, enabled=True):
    uri = os.environ.get('WORK_TIME_TEST_MONGO_URL', 'mongodb://127.0.0.1:27127/?replicaSet=worktime_test')
    assert uri.startswith('mongodb://127.0.0.1:27127/'), 'Tests require the isolated loopback replica set'
    client = AsyncIOMotorClient(uri, tz_aware=True, serverSelectionTimeoutMS=3000)
    db = client['beside_test_work_time_' + uuid.uuid4().hex]
    try:
        await client.admin.command('ping')
        await work_time.ensure_work_time_indexes(db)
        await db.jobs.insert_many([{'job_id':'j1', 'company_id':'a', 'client_name':'Client', 'job_type':'Work', 'is_quote':True},
                                  {'job_id':'j2', 'company_id':'a', 'client_name':'Client 2'},
                                  {'job_id':'secret', 'company_id':'b'}])
        router = APIRouter(prefix='/api')
        work_time.register_work_time_routes(router, db, server.company_scope, server.require_company_roles, enabled)
        app = FastAPI(); app.include_router(router)
        async def actor(request: Request):
            name = request.headers.get('x-test-user')
            if name not in ACTORS: raise HTTPException(401, 'test auth required')
            return ACTORS[name].copy()
        app.dependency_overrides[server.get_current_user] = actor
        clock = [T0]; monkeypatch.setattr(work_time, 'utcnow', lambda: clock[0])
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test', headers={'x-test-user':'owner'}) as api:
            yield api, db, clock, app
    finally:
        await client.drop_database(db.name)
        client.close()

def test_lifecycle_excludes_pauses_and_survives_reopening(monkeypatch):
    async def run():
        async with harness(monkeypatch) as (api, db, clock, app):
            start = op(job_id='j1')
            response = await api.post('/api/work-time/start', json=start); assert response.status_code == 200, response.text
            sid = response.json()['session_id']
            assert (await api.post('/api/work-time/start', json=start)).json()['session_id'] == sid
            clock[0] += timedelta(hours=2)
            paused = op(revision=0)
            assert (await api.post(f'/api/work-time/sessions/{sid}/pause', json=paused)).status_code == 200
            clock[0] += timedelta(days=1, hours=3)
            # A new browser/client fetches the persisted paused session, without frontend state.
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test', headers={'x-test-user':'owner'}) as reopened:
                row = (await reopened.get('/api/work-time/active')).json()['session']
                assert row['effective_seconds'] == 7200 and row['status'] == 'paused'
            assert (await api.post(f'/api/work-time/sessions/{sid}/resume', json=op(revision=1))).status_code == 200
            clock[0] += timedelta(hours=1)
            finish = op(revision=2)
            assert (await api.post(f'/api/work-time/sessions/{sid}/finish', json=finish)).status_code == 200
            assert (await api.post(f'/api/work-time/sessions/{sid}/finish', json=finish)).status_code == 200
            assert (await api.get('/api/work-time/active')).json()['session'] is None
            summary = (await api.get('/api/jobs/j1/work-time')).json()
            assert summary['total_seconds'] == 10800 and summary['estimated_hours'] is None
            assert (await db.jobs.find_one({'job_id':'j1'}))['is_quote'] is True
            assert await db.work_time_events.count_documents({'session_id':sid}) == 4
            clock[0] += timedelta(days=1)
            assert (await api.post('/api/work-time/start', json=op(job_id='j1'))).status_code == 200
            assert await db.work_time_sessions.count_documents({'job_id':'j1'}) == 2
    asyncio.run(run())

def test_concurrent_devices_single_open_and_stale_actions(monkeypatch):
    async def run():
        async with harness(monkeypatch) as (api, db, clock, _):
            # Precreate the worker lock so this checks transactional write conflicts, not just initial upsert.
            await db.work_time_locks.insert_one({'_id':'owner', 'company_id':'a', 'revision':0})
            replies = await asyncio.gather(*[api.post('/api/work-time/start', json=op(job_id='j1')) for _ in range(8)])
            assert sum(r.status_code == 200 for r in replies) == 1
            assert all(r.status_code in (200,409) for r in replies)
            assert await db.work_time_sessions.count_documents({'is_open':True}) == 1
            sid = next(r.json()['session_id'] for r in replies if r.status_code == 200)
            clock[0] += timedelta(minutes=10)
            replies = await asyncio.gather(*[api.post(f'/api/work-time/sessions/{sid}/pause', json=op(revision=0)) for _ in range(3)])
            assert sum(r.status_code == 200 for r in replies) == 1
            conflict = await api.post('/api/work-time/start', json=op(job_id='j2'))
            assert conflict.status_code == 409 and conflict.json()['detail']['message'] == 'Hai già una sessione di lavoro aperta.'
            assert (await api.post(f'/api/work-time/sessions/{sid}/finish', json=op(revision=0))).status_code == 409
            # Different collaborators are allowed to overlap, and totals are additive.
            assert (await api.post('/api/work-time/start', json=op(job_id='j1'), headers={'x-test-user':'member'})).status_code == 200
            clock[0] += timedelta(minutes=10)
            assert (await api.get('/api/jobs/j1/work-time')).json()['total_seconds'] == 1200
    asyncio.run(run())

def test_manual_correction_overlap_audit_and_permissions(monkeypatch):
    async def run():
        async with harness(monkeypatch) as (api, db, clock, _):
            clock[0] = T0 + timedelta(days=5)
            data = op(job_id='j1', started_at=T0.isoformat(), ended_at=(T0+timedelta(hours=3)).isoformat(), pause_seconds=3600, billable=False, notes='Manual work')
            r = await api.post('/api/work-time/manual', json=data, headers={'x-test-user':'member'}); assert r.status_code == 200, r.text
            sid = r.json()['session_id']
            assert (await api.post('/api/work-time/manual', json=data, headers={'x-test-user':'member'})).status_code == 200
            assert (await api.post('/api/work-time/manual', json={**data, 'operation_id':uuid.uuid4().hex}, headers={'x-test-user':'member'})).status_code == 409
            correction = {**data, 'operation_id':uuid.uuid4().hex, 'pause_seconds':1800, 'revision':0}
            assert (await api.patch(f'/api/work-time/sessions/{sid}', json=correction)).status_code == 200
            assert (await api.patch(f'/api/work-time/sessions/{sid}', json=correction)).status_code == 200
            audit = await db.work_time_events.find_one({'action':'correction'})
            assert audit['before']['accumulated_seconds'] == 7200 and audit['after']['accumulated_seconds'] == 9000
            assert audit['actor_user_id'] == 'owner'
            owner_data = {**data, 'operation_id':uuid.uuid4().hex}
            owner_sid = (await api.post('/api/work-time/manual', json=owner_data)).json()['session_id']
            assert (await api.patch(f'/api/work-time/sessions/{owner_sid}', json=correction, headers={'x-test-user':'member'})).status_code == 403
            assert (await api.patch(f'/api/work-time/sessions/{sid}', json=correction, headers={'x-test-user':'outsider'})).status_code == 404
            assert (await api.get('/api/jobs/j1/work-time', headers={'x-test-user':'outsider'})).status_code == 404
            assert (await api.post('/api/work-time/start', json=op(job_id='secret'))).status_code == 404
            assert (await api.post('/api/work-time/start', json=op(job_id='j1'), headers={'x-test-user':'viewer'})).status_code == 403
            assert (await api.get('/api/work-time/active', headers={'x-test-user':'unknown'})).status_code == 401
            for invalid in [dict(pause_seconds=10800), dict(ended_at=T0.isoformat()), dict(ended_at=(clock[0]+timedelta(hours=1)).isoformat()), dict(started_at='2026-01-01T08:00:00')]:
                assert (await api.post('/api/work-time/manual', json={**data, **invalid, 'operation_id':uuid.uuid4().hex})).status_code == 422
            assert (await api.get('/api/jobs/j1/work-time')).json()['billable_seconds'] == 0
    asyncio.run(run())

def test_categories_estimate_and_feature_flag(monkeypatch):
    async def run():
        async with harness(monkeypatch) as (api, db, clock, _):
            r = await api.post('/api/work-time/activities', json={'name':'Sviluppo'})
            aid = r.json()['activity_id']
            assert (await api.post('/api/work-time/activities', json={'name':'sviluppo'})).status_code == 409
            assert (await api.post('/api/work-time/activities', json={'name':'Other'}, headers={'x-test-user':'member'})).status_code == 403
            assert (await api.post('/api/work-time/start', json=op(job_id='secret', activity_id=aid), headers={'x-test-user':'outsider'})).status_code == 422
            assert (await api.put('/api/jobs/j1/work-time/estimate', json=op(hours=10))).status_code == 200
            assert (await api.get('/api/jobs/j1/work-time')).json()['estimated_hours'] == 10
            assert (await api.put('/api/jobs/j1/work-time/estimate', json=op(hours=None))).status_code == 200
            assert (await api.get('/api/jobs/j1/work-time')).json()['estimated_hours'] is None
            assert (await api.post('/api/work-time/start', json=op(job_id='j1', activity_id=aid))).status_code == 200
        async with harness(monkeypatch, enabled=False) as (api, db, clock, _):
            assert not (await api.get('/api/work-time/active')).json()['enabled']
            assert (await api.post('/api/work-time/start', json=op(job_id='j1'))).status_code == 503
    asyncio.run(run())

def test_manual_concurrency_idempotency_and_job_integrity(monkeypatch):
    async def run():
        async with harness(monkeypatch) as (api, db, clock, _):
            monkeypatch.setattr(server, 'db', db)
            clock[0] = T0 + timedelta(days=2)
            await db.work_time_locks.insert_one({'_id':'owner', 'company_id':'a', 'revision':0})
            data = op(job_id='j1', started_at=T0.isoformat(), ended_at=(T0+timedelta(hours=1)).isoformat(), company_id='b', user_id='outsider')
            replies = await asyncio.gather(*[api.post('/api/work-time/manual', json={**data, 'operation_id':uuid.uuid4().hex}) for _ in range(2)])
            assert sorted(r.status_code for r in replies) == [200,409]
            row = await db.work_time_sessions.find_one({})
            assert row['company_id'] == 'a' and row['user_id'] == 'owner'
            with pytest.raises(HTTPException) as error:
                await server.delete_job('j1', ACTORS['owner'])
            assert error.value.status_code == 409
            same = op(job_id='j2')
            replies = await asyncio.gather(*[api.post('/api/work-time/start', json=same) for _ in range(2)])
            assert all(r.status_code == 200 for r in replies)
            assert replies[0].json() == replies[1].json()
            assert (await api.post('/api/work-time/start', json={**same, 'job_id':'j1'})).status_code == 409
            assert await db.work_time_events.count_documents({'action':'start'}) == 1
    asyncio.run(run())
