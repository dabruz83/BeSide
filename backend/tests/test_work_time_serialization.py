"""Read-only API regression tests: Mongo's naive UTC dates must have an offset."""
import asyncio
from datetime import datetime, timezone, timedelta
from copy import deepcopy
from types import SimpleNamespace

import httpx
import pytest
from fastapi import APIRouter, FastAPI
import work_time


@pytest.mark.parametrize('start', [datetime(2026, 1, 12, 8), datetime(2026, 7, 12, 8), datetime(2026, 7, 12, 10, tzinfo=timezone(timedelta(hours=2)))])
def test_utc_offsets_in_active_and_history_without_mutating_stored_dates(start):
    row = {'session_id': 's', 'user_id': 'u', 'company_id': 'c', 'job_id': 'j', 'status': 'paused', 'accumulated_seconds': 3600,
           'started_at': start, 'ended_at': None, 'last_resumed_at': None, 'created_at': start, 'updated_at': start, 'billable': True}
    original = deepcopy(row)
    class Sessions:
        async def find_one(self, *args, **kwargs): return row
        def find(self, *args, **kwargs): return self
        def sort(self, *args): return self
        async def to_list(self, *args): return [row]
    class Jobs:
        async def find_one(self, *args, **kwargs): return {'job_id': 'j'}
    async def user(): return {'user_id': 'u', 'company_id': 'c', 'role': 'owner'}
    db = SimpleNamespace(work_time_sessions=Sessions(), jobs=Jobs())
    router = APIRouter()
    work_time.register_work_time_routes(router, db, lambda user, **kw: {'company_id': user['company_id'], **kw}, lambda *roles: user)
    app = FastAPI(); app.include_router(router)
    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as api:
            active = (await api.get('/work-time/active')).json()['session']
            history = (await api.get('/jobs/j/work-time')).json()['sessions'][0]
            for result in [active, history]:
                for key in ['started_at', 'created_at', 'updated_at']:
                    parsed = datetime.fromisoformat(result[key])
                    assert parsed.utcoffset() == timedelta(0)
                    assert parsed == work_time.aware(start).astimezone(timezone.utc)
                assert result['ended_at'] is None
    asyncio.run(run())
    assert row == original
