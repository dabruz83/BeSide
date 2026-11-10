"""Regression tests for calendar planning (staging features)."""
import asyncio
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import APIRouter

import calendar_api
from multitenancy import company_scope
from test_deployment import InMemoryDatabase
import server


def model(*, start_hour=9, end_hour=11, resource="Postazione 1", job_id=None):
    start = datetime(2026, 11, 18, start_hour, tzinfo=timezone.utc)
    end = datetime(2026, 11, 18, end_hour, tzinfo=timezone.utc)
    return calendar_api.CalendarEventInput(
        title="Installazione PPF",
        starts_at=start, ends_at=end, resource=resource,
        job_id=job_id, job_type="ppf_full", client_name="Cliente test",
        reminder_minutes=[0, 10, 30],
    )


def test_calendar_dates_and_reminders_are_validated():
    value = calendar_api._validated_event(model())
    assert value["starts_at"] == "2026-11-18T09:00:00+00:00"
    assert value["resource_key"] == "postazione 1"
    assert value["reminder_minutes"] == [0, 10, 30]
    with pytest.raises(server.HTTPException) as wrong_order:
        calendar_api._validated_event(model(start_hour=11, end_hour=9))
    assert wrong_order.value.status_code == 422
    with pytest.raises(server.HTTPException) as too_many:
        calendar_api._validated_event(calendar_api.CalendarEventInput(
            **{**model().model_dump(), "reminder_minutes": [0, 5, 10, 20, 30]}
        ))
    assert too_many.value.status_code == 422
    with pytest.raises(server.HTTPException):
        calendar_api._validated_event(calendar_api.CalendarEventInput(
            **{**model().model_dump(), "starts_at": datetime(2026, 11, 18, 9)}
        ))


def test_calendar_crud_respects_company_slots_and_accepted_quote():
    db = InMemoryDatabase()
    route = APIRouter()
    calendar_api.register_calendar_routes(
        route, db, company_scope, server.require_company_roles,
    )
    def endpoint(path, method):
        return next(item.endpoint for item in route.routes
                    if item.path == "/api" + path and method in item.methods) if False else next(
                        item.endpoint for item in route.routes
                        if item.path == path and method in item.methods
                    )

    owner = {"user_id": "owner_1", "company_id": "tenant_1", "role": "owner"}
    other = {"user_id": "owner_2", "company_id": "tenant_2", "role": "owner"}
    create = endpoint("/calendar/events", "POST")
    listing = endpoint("/calendar/events", "GET")
    update = endpoint("/calendar/events/{event_id}", "PUT")
    cancel = endpoint("/calendar/events/{event_id}", "DELETE")
    accepted = endpoint("/calendar/accepted-quotes", "GET")
    db.jobs.documents.extend([
        {"job_id": "accepted_1", "company_id": "tenant_1", "user_id": "owner_1",
         "is_quote": True, "quote_status": "accepted",
         "client_name": "Mario Rossi", "client_email": "mario@example.org",
         "job_type": "ppf_full", "vehicle_info": "Auto",
         "quote_accepted_at": "2026-11-10T10:00:00+00:00"},
        {"job_id": "rejected_1", "company_id": "tenant_1", "user_id": "owner_1",
         "is_quote": True, "quote_status": "rejected"},
        {"job_id": "accepted_elsewhere", "company_id": "tenant_2", "user_id": "owner_2",
         "is_quote": True, "quote_status": "accepted"},
    ])

    async def exercise():
        assert len(await accepted(current_user=owner)) == 1
        first = await create(model(job_id="accepted_1"), current_user=owner)
        assert first["job_id"] == "accepted_1"
        assert first["client_name"] == "Mario Rossi"
        assert len(await accepted(current_user=owner)) == 0

        # Two different tenants can use the same resource and hour.
        second_company = await create(model(), current_user=other)
        assert second_company["company_id"] == "tenant_2"

        # A collision in the same company's physical postazione must be denied.
        with pytest.raises(server.HTTPException) as clash:
            await create(model(start_hour=10, end_hour=12), current_user=owner)
        assert clash.value.status_code == 409

        # Different postazioni are independent concurrent resources.
        second_lane = await create(model(start_hour=10, end_hour=12,
                                         resource="Postazione 2"), current_user=owner)
        assert second_lane["resource"] == "Postazione 2"
        assert len(await listing(
            start=datetime(2026, 11, 18, tzinfo=timezone.utc),
            end=datetime(2026, 11, 19, tzinfo=timezone.utc),
            current_user=owner,
        )) == 2
        assert len(await listing(
            start=datetime(2026, 11, 18, tzinfo=timezone.utc),
            end=datetime(2026, 11, 19, tzinfo=timezone.utc),
            current_user=other,
        )) == 1

        with pytest.raises(server.HTTPException) as cross_tenant:
            await cancel(first["event_id"], current_user=other)
        assert cross_tenant.value.status_code == 404

        moved = await update(first["event_id"], model(start_hour=12, end_hour=14,
                                                      job_id="accepted_1"), current_user=owner)
        assert moved["starts_at"].startswith("2026-11-18T12:00")
        result = await cancel(first["event_id"], current_user=owner)
        assert result["status"] == "cancelled"
        assert len(await accepted(current_user=owner)) == 1

        # Rebooking after cancellation is permitted.
        recreated = await create(model(job_id="accepted_1"), current_user=owner)
        assert recreated["event_id"] != first["event_id"]
        with pytest.raises(server.HTTPException) as duplicate_job:
            await create(model(start_hour=14, end_hour=16, resource="Postazione 3",
                               job_id="accepted_1"), current_user=owner)
        assert duplicate_job.value.status_code == 409

    asyncio.run(exercise())
