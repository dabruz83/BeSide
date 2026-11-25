"""Tenant-scoped work sessions. Writes require MongoDB replica-set transactions."""
import hashlib
import json
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import Depends, HTTPException
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, Field
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError, OperationFailure


def utcnow():
    return datetime.now(timezone.utc)


def aware(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def seconds(row, now):
    return row['accumulated_seconds'] + (max(0, (now - aware(row['last_resumed_at'])).total_seconds())
        if row['status'] == 'running' else 0)


class Operation(BaseModel):
    operation_id: str = Field(min_length=16, max_length=80, pattern=r'^[a-zA-Z0-9_-]+$')


class Start(Operation):
    job_id: str = Field(min_length=1, max_length=100)
    activity_id: Optional[str] = Field(default=None, max_length=100)
    billable: bool = True
    notes: str = Field(default='', max_length=2000)


class Transition(Operation):
    revision: int = Field(ge=0)


class Manual(Start):
    started_at: datetime
    ended_at: datetime
    pause_seconds: int = Field(default=0, ge=0)
    revision: Optional[int] = Field(default=None, ge=0)


class Activity(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    active: bool = True


class Estimate(Operation):
    hours: Optional[float] = Field(default=None, gt=0, le=100000, allow_inf_nan=False)


async def ensure_work_time_indexes(db):
    await db.work_time_sessions.create_index('session_id', unique=True)
    await db.work_time_sessions.create_index('user_id', unique=True, partialFilterExpression={'is_open': True}, name='one_open_session_per_user')
    await db.work_time_sessions.create_index([('company_id', 1), ('job_id', 1), ('started_at', 1)])
    await db.work_time_sessions.create_index([('user_id', 1), ('started_at', 1), ('ended_at', 1)])
    await db.work_time_events.create_index([('company_id', 1), ('session_id', 1), ('created_at', 1)])
    await db.work_time_activities.create_index([('company_id', 1), ('name_key', 1)], unique=True)


def register_work_time_routes(router, db, company_scope, require_company_roles, enabled=True):
    reader = require_company_roles('owner', 'admin', 'member', 'viewer')
    writer = require_company_roles('owner', 'admin', 'member')
    manager = require_company_roles('owner', 'admin')

    def check_enabled():
        if not enabled:
            raise HTTPException(503, 'Rilevazione ore non abilitata')

    async def job(user, job_id, session=None, lock=False):
        if lock:
            result = await db.jobs.find_one_and_update(company_scope(user, job_id=job_id),
                {'$set': {'work_time_has_sessions': True}}, projection={'_id': 0},
                return_document=ReturnDocument.AFTER, session=session)
        else:
            result = await db.jobs.find_one(company_scope(user, job_id=job_id), {'_id': 0}, session=session)
        if not result:
            raise HTTPException(404, 'Commessa non trovata')
        return result

    async def activity(user, activity_id, session):
        if activity_id and not await db.work_time_activities.find_one(
            company_scope(user, activity_id=activity_id, active=True), session=session):
            raise HTTPException(422, 'Attività non disponibile')

    async def serialize(row, now):
        if not row:
            return None
        row = {k: v for k, v in row.items() if k != '_id'}
        row['effective_seconds'] = seconds(row, now)
        return jsonable_encoder(row)

    async def transact(user, payload, kind, subject, callback):
        check_enabled()
        operation_key = f"{user['company_id']}:{user['user_id']}:{payload.operation_id}"
        fingerprint = hashlib.sha256(json.dumps({'kind': kind, 'data': payload.model_dump(mode='json')}, sort_keys=True).encode()).hexdigest()
        async def execute(session):
            # All writes concerning one worker contend on one document, including manual corrections.
            await db.work_time_locks.update_one({'_id': subject}, {'$inc': {'revision': 1}, '$set': {'company_id': user['company_id']}}, upsert=True, session=session)
            previous = await db.work_time_operations.find_one({'_id': operation_key}, session=session)
            if previous:
                if previous['fingerprint'] != fingerprint:
                    raise HTTPException(409, 'Identificatore operazione già utilizzato')
                return previous['result']
            now = utcnow()
            result = await callback(session, now)
            await db.work_time_operations.insert_one({'_id': operation_key, 'company_id': user['company_id'],
                'fingerprint': fingerprint, 'result': result, 'created_at': now}, session=session)
            return result
        try:
            async with await db.client.start_session() as session:
                return await session.with_transaction(execute)
        except DuplicateKeyError:
            raise HTTPException(409, 'Operazione concorrente: aggiorna e riprova') from None
        except OperationFailure as error:
            if error.code in (20, 263, 303):
                raise HTTPException(503, 'Rilevazione ore richiede transazioni MongoDB abilitate') from None
            raise

    async def event(user, row, action, now, session, before=None):
        await db.work_time_events.insert_one({'event_id': uuid.uuid4().hex, 'company_id': user['company_id'],
            'session_id': row['session_id'], 'job_id': row['job_id'], 'actor_user_id': user['user_id'],
            'action': action, 'created_at': now, 'before': before,
            'after': {k: v for k, v in row.items() if k != '_id'}}, session=session)

    async def no_overlap(user_id, start, end, session, exclude=None):
        query = {'user_id': user_id, '$or': [{'ended_at': None}, {'ended_at': {'$gt': start}}]}
        if end:
            query['started_at'] = {'$lt': end}
        if exclude:
            query['session_id'] = {'$ne': exclude}
        if await db.work_time_sessions.find_one(query, session=session):
            raise HTTPException(409, 'Intervallo sovrapposto a un’altra sessione dello stesso collaboratore')

    @router.get('/work-time/active')
    async def active(user=Depends(reader)):
        now = utcnow()
        row = await db.work_time_sessions.find_one(company_scope(user, user_id=user['user_id'], is_open=True)) if enabled else None
        return {'enabled': enabled, 'server_now': now, 'session': await serialize(row, now)}

    @router.get('/jobs/{job_id}/work-time')
    async def summary(job_id: str, user=Depends(reader)):
        check_enabled()
        work = await job(user, job_id)
        now = utcnow()
        rows = await db.work_time_sessions.find(company_scope(user, job_id=job_id), {'_id': 0}).sort('started_at', -1).to_list(None)
        return {'server_now': now, 'estimated_hours': work.get('estimated_work_hours'),
            'total_seconds': sum(seconds(row, now) for row in rows),
            'billable_seconds': sum(seconds(row, now) for row in rows if row['billable']),
            'sessions': [await serialize(row, now) for row in rows]}

    @router.put('/jobs/{job_id}/work-time/estimate')
    async def estimate(job_id: str, payload: Estimate, user=Depends(manager)):
        async def save(session, now):
            work = await job(user, job_id, session)
            await db.jobs.update_one(company_scope(user, job_id=job_id), {'$set': {'estimated_work_hours': payload.hours}}, session=session)
            await db.work_time_events.insert_one({'company_id': user['company_id'], 'job_id': job_id,
                'actor_user_id': user['user_id'], 'action': 'estimate', 'created_at': now,
                'before': work.get('estimated_work_hours'), 'after': payload.hours}, session=session)
            return {'saved': True}
        return await transact(user, payload, f'estimate:{job_id}', f'job:{job_id}', save)

    @router.post('/work-time/start')
    async def start(payload: Start, user=Depends(writer)):
        async def save(session, now):
            work = await job(user, payload.job_id, session, lock=True)
            await activity(user, payload.activity_id, session)
            current = await db.work_time_sessions.find_one({'user_id': user['user_id'], 'is_open': True}, session=session)
            if current:
                raise HTTPException(409, {'message': 'Hai già una sessione di lavoro aperta.',
                    'session': await serialize(current, now) if current['company_id'] == user['company_id'] else None})
            await no_overlap(user['user_id'], now, None, session)
            row = {'session_id': 'wt_' + uuid.uuid4().hex, 'company_id': user['company_id'],
                'job_id': payload.job_id, 'user_id': user['user_id'],
                'collaborator_name': user.get('full_name') or user.get('first_name') or user.get('email'),
                'job_name': work.get('vehicle_info') or work.get('job_type') or 'Commessa', 'client_name': work.get('client_name', ''),
                'activity_id': payload.activity_id, 'status': 'running', 'is_open': True,
                'started_at': now, 'ended_at': None, 'accumulated_seconds': 0, 'last_resumed_at': now,
                'billable': payload.billable, 'source': 'timer', 'notes': payload.notes, 'revision': 0,
                'created_at': now, 'updated_at': now, 'hourly_cost_snapshot': None, 'hourly_rate_snapshot': None}
            await db.work_time_sessions.insert_one(row, session=session)
            await event(user, row, 'start', now, session)
            return {'session_id': row['session_id']}
        return await transact(user, payload, 'start', user['user_id'], save)

    @router.post('/work-time/sessions/{session_id}/{action}')
    async def transition(session_id: str, action: str, payload: Transition, user=Depends(writer)):
        if action not in ('pause', 'resume', 'finish'):
            raise HTTPException(404, 'Azione non disponibile')
        async def save(session, now):
            row = await db.work_time_sessions.find_one(company_scope(user, session_id=session_id, user_id=user['user_id']), session=session)
            if not row:
                raise HTTPException(404, 'Sessione non trovata')
            if row['revision'] != payload.revision or not row['is_open']:
                raise HTTPException(409, 'Sessione modificata su un altro dispositivo: aggiorna')
            if (action == 'pause' and row['status'] != 'running') or (action == 'resume' and row['status'] != 'paused'):
                raise HTTPException(409, 'Stato sessione non compatibile')
            before = {k: v for k, v in row.items() if k != '_id'}
            row['accumulated_seconds'] = seconds(row, now)
            row.update(status={'pause': 'paused', 'resume': 'running', 'finish': 'ended'}[action],
                last_resumed_at=now if action == 'resume' else None, updated_at=now, revision=row['revision'] + 1,
                ended_at=now if action == 'finish' else None, is_open=action != 'finish')
            await db.work_time_sessions.replace_one({'_id': row['_id']}, row, session=session)
            await event(user, row, action, now, session, before)
            return {'session_id': session_id}
        return await transact(user, payload, f'{action}:{session_id}', user['user_id'], save)

    async def manual_write(payload, user, session_id=None):
        if payload.started_at.tzinfo is None or payload.ended_at.tzinfo is None:
            raise HTTPException(422, 'Gli orari devono includere il fuso orario')
        start_at, end_at = aware(payload.started_at), aware(payload.ended_at)
        duration = (end_at - start_at).total_seconds() - payload.pause_seconds
        if end_at > utcnow() or duration <= 0 or start_at >= end_at:
            raise HTTPException(422, 'Durata, pause o intervallo non validi')
        target = await db.work_time_sessions.find_one(company_scope(user, session_id=session_id)) if session_id else None
        if session_id and not target:
            raise HTTPException(404, 'Sessione non trovata')
        subject = target['user_id'] if target else user['user_id']
        if subject != user['user_id'] and user['role'] not in ('owner', 'admin'):
            raise HTTPException(403, 'Puoi correggere solo le tue ore')
        async def save(session, now):
            work = await job(user, payload.job_id, session, lock=True)
            before = None
            if session_id:
                before = await db.work_time_sessions.find_one(company_scope(user, session_id=session_id), {'_id': 0}, session=session)
                if not before or before['is_open'] or before['revision'] != payload.revision or before['job_id'] != payload.job_id:
                    raise HTTPException(409, 'Termina la sessione e aggiorna prima di correggerla')
            if not before or before['activity_id'] != payload.activity_id:
                await activity(user, payload.activity_id, session)
            await no_overlap(subject, start_at, end_at, session, session_id)
            row = {**(before or {}), 'session_id': session_id or 'wt_' + uuid.uuid4().hex,
                'company_id': user['company_id'], 'job_id': payload.job_id, 'user_id': subject,
                'collaborator_name': before['collaborator_name'] if before else user.get('full_name') or user.get('first_name') or user.get('email'),
                'job_name': work.get('vehicle_info') or work.get('job_type') or 'Commessa', 'client_name': work.get('client_name', ''),
                'activity_id': payload.activity_id, 'status': 'ended', 'is_open': False, 'started_at': start_at,
                'ended_at': end_at, 'accumulated_seconds': duration, 'last_resumed_at': None, 'pause_seconds': payload.pause_seconds,
                'billable': payload.billable, 'notes': payload.notes, 'source': before['source'] if before else 'manual',
                'created_at': before['created_at'] if before else now, 'updated_at': now,
                'revision': before['revision'] + 1 if before else 0,
                'hourly_cost_snapshot': before.get('hourly_cost_snapshot') if before else None,
                'hourly_rate_snapshot': before.get('hourly_rate_snapshot') if before else None}
            await db.work_time_sessions.replace_one(company_scope(user, session_id=row['session_id']), row, upsert=True, session=session)
            await event(user, row, 'correction' if before else 'manual', now, session, before)
            return {'session_id': row['session_id']}
        return await transact(user, payload, f'manual:{session_id or "new"}', subject, save)

    @router.post('/work-time/manual')
    async def manual(payload: Manual, user=Depends(writer)):
        return await manual_write(payload, user)

    @router.patch('/work-time/sessions/{session_id}')
    async def correct(session_id: str, payload: Manual, user=Depends(writer)):
        return await manual_write(payload, user, session_id)

    @router.get('/work-time/activities')
    async def activities(user=Depends(reader)):
        check_enabled()
        return await db.work_time_activities.find(company_scope(user), {'_id': 0}).sort('name', 1).to_list(None)

    @router.post('/work-time/activities')
    async def create_activity(payload: Activity, user=Depends(manager)):
        check_enabled()
        name = payload.name.strip()
        if not name:
            raise HTTPException(422, 'Nome attività richiesto')
        row = {'company_id': user['company_id'], 'activity_id': 'wa_' + uuid.uuid4().hex,
            'name': name, 'name_key': name.casefold(), 'active': payload.active}
        try:
            await db.work_time_activities.insert_one(row)
        except DuplicateKeyError:
            raise HTTPException(409, 'Attività già presente') from None
        row.pop('_id', None)
        return row

    @router.patch('/work-time/activities/{activity_id}')
    async def edit_activity(activity_id: str, payload: Activity, user=Depends(manager)):
        check_enabled()
        name = payload.name.strip()
        if not name:
            raise HTTPException(422, 'Nome attività richiesto')
        try:
            row = await db.work_time_activities.find_one_and_update(company_scope(user, activity_id=activity_id),
                {'$set': {'name': name, 'name_key': name.casefold(), 'active': payload.active}},
                projection={'_id': 0}, return_document=ReturnDocument.AFTER)
        except DuplicateKeyError:
            raise HTTPException(409, 'Attività già presente') from None
        if not row:
            raise HTTPException(404, 'Attività non trovata')
        return row
