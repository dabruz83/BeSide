"""Company-scoped appointment planning for BESIDE.

Appointments belong to companies, not to public quote-token holders. External
customer date proposals, rescheduling links and calendar sync are later phases.
"""
import asyncio
import html
import logging
import uuid
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from typing import List, Optional

from fastapi import BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr, Field
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

logger = logging.getLogger(__name__)
REMINDER_CHOICES = frozenset({0, 5, 10, 20, 30, 60})
MAX_EVENT_HOURS = 24 * 14
DEFAULT_WORK_AREA_ID = "area_default"
DEFAULT_WORK_AREA_NAME = "Area principale"
LEGACY_DEFAULT_AREA_KEYS = ("postazione 1", "area principale", DEFAULT_WORK_AREA_ID)


class CalendarWorkAreaInput(BaseModel):
    area_id: Optional[str] = Field(default=None, max_length=80)
    name: str = Field(min_length=1, max_length=80)


class CalendarWorkAreasInput(BaseModel):
    areas: List[CalendarWorkAreaInput] = Field(min_length=1, max_length=12)


class CalendarWorkDayInput(BaseModel):
    day: int = Field(ge=0, le=6)
    enabled: bool = False
    start: Optional[str] = Field(default=None, max_length=5)
    end: Optional[str] = Field(default=None, max_length=5)
    break_start: Optional[str] = Field(default=None, max_length=5)
    break_end: Optional[str] = Field(default=None, max_length=5)


class CalendarWorkHoursInput(BaseModel):
    days: List[CalendarWorkDayInput] = Field(min_length=7, max_length=7)


class CalendarEventInput(BaseModel):
    title: str = Field(min_length=1, max_length=180)
    starts_at: datetime
    ends_at: datetime
    resource: str = Field(default=DEFAULT_WORK_AREA_NAME, min_length=1, max_length=80)
    resource_id: Optional[str] = Field(default=DEFAULT_WORK_AREA_ID, max_length=80)
    job_id: Optional[str] = Field(default=None, max_length=100)
    job_type: str = Field(default="altro", max_length=80)
    client_name: str = Field(default="", max_length=200)
    client_email: Optional[EmailStr] = None
    client_phone: str = Field(default="", max_length=40)
    vehicle_info: str = Field(default="", max_length=200)
    vehicle_make: str = Field(default="", max_length=100)
    vehicle_model: str = Field(default="", max_length=100)
    vehicle_plate: str = Field(default="", max_length=30)
    work_subject: str = Field(default="", max_length=300)
    notes: str = Field(default="", max_length=2000)
    reminder_minutes: List[int] = Field(default_factory=lambda: [30])


def _validated_event(data: CalendarEventInput) -> dict:
    if not data.starts_at.tzinfo or not data.ends_at.tzinfo:
        raise HTTPException(422, "Inserisci data e ora complete, con fuso orario")
    starts = data.starts_at.astimezone(timezone.utc)
    ends = data.ends_at.astimezone(timezone.utc)
    duration = (ends - starts).total_seconds()
    if not 0 < duration <= MAX_EVENT_HOURS * 3600:
        raise HTTPException(422, "La durata deve essere positiva e non superare 14 giorni")
    if starts.year < 2020 or starts.year > datetime.now(timezone.utc).year + 5:
        raise HTTPException(422, "Data fuori dall'intervallo supportato")
    reminders = list(dict.fromkeys(data.reminder_minutes))
    if len(reminders) > 4 or any(v not in REMINDER_CHOICES for v in reminders):
        raise HTTPException(422, "Seleziona fino a quattro promemoria validi")
    return {
        "title": data.title.strip(),
        "starts_at": starts.isoformat(),
        "ends_at": ends.isoformat(),
        "resource": data.resource.strip(),
        "resource_id": data.resource_id.strip() if data.resource_id else None,
        "resource_key": (data.resource_id or data.resource).strip().casefold(),
        "job_id": data.job_id or None,
        "job_type": data.job_type.strip() or "altro",
        "client_name": data.client_name.strip(),
        "client_email": str(data.client_email).strip().lower() if data.client_email else None,
        "client_phone": data.client_phone.strip(),
        "vehicle_info": data.vehicle_info.strip(),
        "vehicle_make": data.vehicle_make.strip(),
        "vehicle_model": data.vehicle_model.strip(),
        "vehicle_plate": data.vehicle_plate.strip().upper(),
        "work_subject": data.work_subject.strip(),
        "notes": data.notes.strip(),
        "reminder_minutes": reminders,
    }


def _default_work_areas() -> List[dict]:
    return [{"area_id": DEFAULT_WORK_AREA_ID, "name": DEFAULT_WORK_AREA_NAME}]


async def _load_work_areas(db, company_id: str) -> List[dict]:
    company = await db.companies.find_one(
        {"company_id": company_id}, {"_id": 0, "calendar_work_areas": 1},
    )
    configured = (company or {}).get("calendar_work_areas") or []
    areas = [
        {"area_id": str(item.get("area_id") or "").strip(),
         "name": str(item.get("name") or "").strip()}
        for item in configured
        if item.get("area_id") and str(item.get("name") or "").strip()
    ]
    return areas or _default_work_areas()


def _validate_work_time(value: Optional[str], label: str) -> Optional[str]:
    if value in (None, ""):
        return None
    try:
        datetime.strptime(value, "%H:%M")
    except ValueError as exc:
        raise HTTPException(422, f"Orario {label} non valido") from exc
    return value


async def _resolve_work_area(db, company_id: str, event: dict) -> None:
    areas = await _load_work_areas(db, company_id)
    requested_id = event.get("resource_id")
    requested_name = event.get("resource", "").casefold()
    area = next((item for item in areas if item["area_id"] == requested_id), None)
    if not area and requested_name in {"postazione 1", "area principale"}:
        area = next((item for item in areas if item["area_id"] == DEFAULT_WORK_AREA_ID), areas[0])
    if not area:
        area = next((item for item in areas if item["name"].casefold() == requested_name), None)
    if not area:
        raise HTTPException(422, "Seleziona un'area di lavoro configurata")
    event["resource_id"] = area["area_id"]
    event["resource"] = area["name"]
    event["resource_key"] = area["area_id"].casefold()


async def _lock_company(db, company_id: str) -> str:
    """Short database-backed mutex, serializes overlap checks and writes."""
    key = uuid.uuid4().hex
    now = datetime.now(timezone.utc)
    try:
        await db.calendar_locks.find_one_and_update(
            {"_id": company_id, "$or": [
                {"expires_at": {"$lt": now.isoformat()}},
                {"expires_at": {"$exists": False}},
            ]},
            {"$set": {"owner": key,
                      "expires_at": (now + timedelta(seconds=20)).isoformat()}},
            upsert=True, return_document=ReturnDocument.AFTER,
        )
    except DuplicateKeyError:
        raise HTTPException(409, "Calendario occupato: riprova tra pochi secondi")
    return key


async def _unlock_company(db, company_id: str, key: str) -> None:
    await db.calendar_locks.delete_one({"_id": company_id, "owner": key})


async def _check_job(db, company_scope, current_user: dict, job_id: Optional[str],
                     editing_event_id: Optional[str] = None) -> Optional[dict]:
    if not job_id:
        return None
    job = await db.jobs.find_one(company_scope(current_user, job_id=job_id), {"_id": 0})
    if not job or not job.get("is_quote") or job.get("quote_status") != "accepted":
        raise HTTPException(400, "Puoi collegare soltanto preventivi accettati")
    existing = await db.calendar_events.find_one({
        "company_id": current_user["company_id"], "job_id": job_id,
        "status": "confirmed",
        "event_id": {"$ne": editing_event_id or ""},
    })
    if existing:
        raise HTTPException(409, "Questo preventivo ha già un appuntamento pianificato")
    return job


async def _check_overlap(db, company_id: str, event: dict,
                         editing_event_id: Optional[str] = None) -> None:
    area_matches = [
        {"resource_id": event["resource_id"]},
        {"resource_key": event["resource_key"]},
    ]
    if event["resource_id"] == DEFAULT_WORK_AREA_ID:
        area_matches.append({"resource_key": {"$in": list(LEGACY_DEFAULT_AREA_KEYS)}})
    overlap = await db.calendar_events.find_one({
        "company_id": company_id,
        "$or": area_matches, "status": "confirmed",
        "starts_at": {"$lt": event["ends_at"]},
        "ends_at": {"$gt": event["starts_at"]},
        "event_id": {"$ne": editing_event_id or ""},
    }, {"_id": 0, "event_id": 1})
    if overlap:
        raise HTTPException(409, "Fascia oraria già occupata per questa area di lavoro")


def register_calendar_routes(router, db, company_scope, require_company_roles):
    roles = require_company_roles("owner", "admin", "member")
    manage_roles = require_company_roles("owner", "admin")

    @router.get("/calendar/work-areas")
    async def calendar_work_areas(current_user: dict = Depends(roles)):
        return await _load_work_areas(db, current_user["company_id"])

    @router.put("/calendar/work-areas")
    async def update_calendar_work_areas(
        data: CalendarWorkAreasInput,
        current_user: dict = Depends(manage_roles),
    ):
        company_id = current_user["company_id"]
        current = await _load_work_areas(db, company_id)
        current_by_id = {item["area_id"]: item for item in current}
        names = set()
        updated = []
        for item in data.areas:
            name = " ".join(item.name.split())
            name_key = name.casefold()
            if name_key in names:
                raise HTTPException(422, "Ogni area di lavoro deve avere un nome diverso")
            names.add(name_key)
            requested_id = (item.area_id or "").strip()
            area_id = requested_id if requested_id in current_by_id else "area_" + uuid.uuid4().hex[:16]
            if requested_id == DEFAULT_WORK_AREA_ID:
                area_id = DEFAULT_WORK_AREA_ID
            updated.append({"area_id": area_id, "name": name})

        updated_ids = {item["area_id"] for item in updated}
        removed = [item for item in current if item["area_id"] not in updated_ids]
        now = datetime.now(timezone.utc).isoformat()
        for area in removed:
            matches = [{"resource_id": area["area_id"]}]
            if area["area_id"] == DEFAULT_WORK_AREA_ID:
                matches.append({"resource_key": {"$in": list(LEGACY_DEFAULT_AREA_KEYS)}})
            future = await db.calendar_events.find_one({
                "company_id": company_id, "status": "confirmed",
                "ends_at": {"$gt": now}, "$or": matches,
            }, {"_id": 0, "event_id": 1})
            if future:
                raise HTTPException(
                    409,
                    f"{area['name']} ha appuntamenti futuri: spostali prima di rimuoverla",
                )

        for area in updated:
            previous = current_by_id.get(area["area_id"])
            if not previous or previous["name"] == area["name"]:
                continue
            matches = [{"resource_id": area["area_id"]}]
            if area["area_id"] == DEFAULT_WORK_AREA_ID:
                matches.append({"resource_key": {"$in": list(LEGACY_DEFAULT_AREA_KEYS)}})
            await db.calendar_events.update_many(
                {"company_id": company_id, "$or": matches},
                {"$set": {
                    "resource_id": area["area_id"],
                    "resource": area["name"],
                    "resource_key": area["area_id"].casefold(),
                    "updated_at": now,
                }},
            )

        result = await db.companies.update_one(
            {"company_id": company_id},
            {"$set": {"calendar_work_areas": updated, "updated_at": now}},
        )
        if getattr(result, "matched_count", 0) == 0:
            raise HTTPException(404, "Azienda non trovata")
        return updated

    @router.get("/calendar/work-hours")
    async def calendar_work_hours(current_user: dict = Depends(roles)):
        company = await db.companies.find_one(
            {"company_id": current_user["company_id"]},
            {"_id": 0, "calendar_work_hours": 1},
        )
        configured = (company or {}).get("calendar_work_hours")
        return {"configured": bool(configured), "days": configured or []}

    @router.put("/calendar/work-hours")
    async def update_calendar_work_hours(
        data: CalendarWorkHoursInput,
        current_user: dict = Depends(manage_roles),
    ):
        if len({item.day for item in data.days}) != 7:
            raise HTTPException(422, "Configura una sola voce per ogni giorno della settimana")
        days = []
        for item in sorted(data.days, key=lambda value: value.day):
            start = _validate_work_time(item.start, "di inizio")
            end = _validate_work_time(item.end, "di fine")
            break_start = _validate_work_time(item.break_start, "di inizio pausa")
            break_end = _validate_work_time(item.break_end, "di fine pausa")
            if item.enabled:
                if not start or not end or start >= end:
                    raise HTTPException(422, "Ogni giorno lavorativo deve avere inizio e fine validi")
                if (break_start and not break_end) or (break_end and not break_start):
                    raise HTTPException(422, "La pausa richiede inizio e fine")
                if break_start and not (start <= break_start < break_end <= end):
                    raise HTTPException(422, "La pausa deve essere compresa nell'orario lavorativo")
            days.append({"day": item.day, "enabled": item.enabled, "start": start, "end": end,
                         "break_start": break_start, "break_end": break_end})
        now = datetime.now(timezone.utc).isoformat()
        result = await db.companies.update_one(
            {"company_id": current_user["company_id"]},
            {"$set": {"calendar_work_hours": days, "updated_at": now}},
        )
        if getattr(result, "matched_count", 0) == 0:
            raise HTTPException(404, "Azienda non trovata")
        return {"configured": True, "days": days}

    @router.get("/calendar/events")
    async def calendar_events(
        start: datetime, end: datetime,
        current_user: dict = Depends(roles),
    ):
        if not start.tzinfo or not end.tzinfo:
            raise HTTPException(422, "Specifica il fuso orario")
        begin = start.astimezone(timezone.utc)
        finish = end.astimezone(timezone.utc)
        if finish <= begin or finish - begin > timedelta(days=62):
            raise HTTPException(422, "Seleziona un periodo compreso tra 1 e 62 giorni")
        query = company_scope(current_user)
        query.update({
            "status": "confirmed",
            "starts_at": {"$lt": finish.isoformat()},
            "ends_at": {"$gt": begin.isoformat()},
        })
        return await db.calendar_events.find(query, {"_id": 0, "resource_key": 0})\
            .sort("starts_at", 1).limit(1000).to_list(1000)

    @router.get("/calendar/accepted-quotes")
    async def unscheduled_quotes(current_user: dict = Depends(roles)):
        quotes = await db.jobs.find(company_scope(
            current_user, is_quote=True, quote_status="accepted"),
            {"_id": 0, "job_id": 1, "client_name": 1, "client_email": 1,
             "client_phone": 1,
             "vehicle_info": 1, "job_type": 1, "quote_amount": 1,
             "quote_accepted_at": 1}).sort("quote_accepted_at", -1).limit(300).to_list(300)
        if not quotes:
            return []
        active = await db.calendar_events.find(
            {"company_id": current_user["company_id"], "status": "confirmed",
             "job_id": {"$in": [q["job_id"] for q in quotes]}},
            {"_id": 0, "job_id": 1}).to_list(300)
        scheduled = {e["job_id"] for e in active}
        return [q for q in quotes if q["job_id"] not in scheduled]

    @router.post("/calendar/events", status_code=201)
    async def create_calendar_event(data: CalendarEventInput,
                                    current_user: dict = Depends(roles)):
        value = _validated_event(data)
        company_id = current_user["company_id"]
        await _resolve_work_area(db, company_id, value)
        lock = await _lock_company(db, company_id)
        try:
            quote = await _check_job(db, company_scope, current_user, value["job_id"])
            if quote:
                value["client_name"] = quote.get("client_name") or value["client_name"]
                value["client_email"] = quote.get("client_email") or value["client_email"]
                value["client_phone"] = quote.get("client_phone") or value["client_phone"]
                value["job_type"] = quote.get("job_type") or value["job_type"]
                value["vehicle_info"] = quote.get("vehicle_info") or value["vehicle_info"]
            await _check_overlap(db, company_id, value)
            now = datetime.now(timezone.utc).isoformat()
            value.update({
                "event_id": "cal_" + uuid.uuid4().hex[:20],
                "company_id": company_id, "created_by": current_user["user_id"],
                "status": "confirmed", "revision": 1,
                "created_at": now, "updated_at": now,
            })
            await db.calendar_events.insert_one(value)
            return {k: v for k, v in value.items() if k not in {"_id", "resource_key"}}
        finally:
            await _unlock_company(db, company_id, lock)

    @router.put("/calendar/events/{event_id}")
    async def update_calendar_event(event_id: str, data: CalendarEventInput,
                                    current_user: dict = Depends(roles)):
        value = _validated_event(data)
        company_id = current_user["company_id"]
        await _resolve_work_area(db, company_id, value)
        lock = await _lock_company(db, company_id)
        try:
            old = await db.calendar_events.find_one({
                "company_id": company_id, "event_id": event_id, "status": "confirmed",
            })
            if not old:
                raise HTTPException(404, "Appuntamento non trovato")
            quote = await _check_job(db, company_scope, current_user, value["job_id"],
                                     editing_event_id=event_id)
            if quote:
                value["client_name"] = quote.get("client_name") or value["client_name"]
                value["client_email"] = quote.get("client_email") or value["client_email"]
                value["client_phone"] = quote.get("client_phone") or value["client_phone"]
                value["job_type"] = quote.get("job_type") or value["job_type"]
                value["vehicle_info"] = quote.get("vehicle_info") or value["vehicle_info"]
            await _check_overlap(db, company_id, value, editing_event_id=event_id)
            value["revision"] = old.get("revision", 1) + 1
            value["updated_at"] = datetime.now(timezone.utc).isoformat()
            await db.calendar_events.update_one(
                {"company_id": company_id, "event_id": event_id, "status": "confirmed"},
                {"$set": value},
            )
            return {**{k: v for k, v in old.items()
                       if k not in {"_id", "resource_key"}}, **{
                           k: v for k, v in value.items() if k != "resource_key"}}
        finally:
            await _unlock_company(db, company_id, lock)

    @router.delete("/calendar/events/{event_id}")
    async def cancel_calendar_event(event_id: str,
                                    current_user: dict = Depends(roles)):
        company_id = current_user["company_id"]
        lock = await _lock_company(db, company_id)
        try:
            event = await db.calendar_events.find_one({
                "company_id": company_id, "event_id": event_id, "status": "confirmed",
            })
            if not event:
                raise HTTPException(404, "Appuntamento non trovato")
            now = datetime.now(timezone.utc).isoformat()
            await db.calendar_events.update_one(
                {"company_id": company_id, "event_id": event_id, "status": "confirmed"},
                {"$set": {"status": "cancelled", "cancelled_at": now,
                          "updated_at": now},
                 "$inc": {"revision": 1}},
            )
            return {"status": "cancelled"}
        finally:
            await _unlock_company(db, company_id, lock)


async def run_calendar_reminder_worker(db, send_email, every_seconds: int = 45):
    """Durable email reminders for installers; avoids duplicate sends per revision.

    Events are checked with an atomic send claim. If email delivery fails, the
    claim is removed for a later retry. This worker never contacts clients.
    """
    await db.calendar_reminder_claims.create_index(
        [("event_id", 1), ("revision", 1), ("lead_minutes", 1)], unique=True
    )
    while True:
        try:
            now = datetime.now(timezone.utc)
            soon = now + timedelta(minutes=61)
            events = await db.calendar_events.find({
                "status": "confirmed", "reminder_minutes": {"$ne": []},
                "starts_at": {"$gte": (now - timedelta(minutes=2)).isoformat(),
                              "$lte": soon.isoformat()},
            }, {"_id": 0}).limit(300).to_list(300)
            for event in events:
                starts = datetime.fromisoformat(event["starts_at"])
                for lead in event.get("reminder_minutes", []):
                    due = starts - timedelta(minutes=lead)
                    # Only deliver near the selected interval, never send a
                    # burst of all overdue reminders when an event was created
                    # shortly before its start.
                    if not (due <= now < due + timedelta(minutes=2)):
                        continue
                    key = {
                        "event_id": event["event_id"],
                        "revision": event.get("revision", 1),
                        "lead_minutes": lead,
                    }
                    try:
                        await db.calendar_reminder_claims.insert_one({
                            **key, "status": "sending",
                            "claimed_at": now.isoformat(),
                        })
                    except DuplicateKeyError:
                        continue
                    company = await db.companies.find_one(
                        {"company_id": event["company_id"]},
                        {"_id": 0, "owner_user_id": 1, "subscription_pause_effective_at": 1})
                    deadline = (company or {}).get("subscription_pause_effective_at")
                    if deadline and datetime.fromisoformat(deadline.replace("Z", "+00:00")) <= now:
                        await db.calendar_reminder_claims.delete_one(key)
                        continue
                    owner = await db.users.find_one(
                        {"user_id": (company or {}).get("owner_user_id"),
                         "company_id": event["company_id"], "is_active": {"$ne": False}},
                        {"_id": 0, "email": 1},
                    )
                    email = (owner or {}).get("email")
                    if not email:
                        await db.calendar_reminder_claims.delete_one(key)
                        continue
                    date_text = starts.astimezone(ZoneInfo("Europe/Rome")).strftime("%d/%m/%Y alle %H:%M")
                    safe = html.escape
                    title = safe(event.get("title") or "Lavoro")
                    content = (
                        "<p>Promemoria Beside: è previsto un lavoro.</p>"
                        f"<p><strong>{title}</strong></p>"
                        f"<p>Data e ora: {safe(date_text)} (Italia)</p>"
                        f"<p>Cliente: {safe(event.get('client_name') or '—')}</p>"
                        f"<p>Area di lavoro: {safe(event.get('resource') or '—')}</p>"
                        "<p>Apri Beside → Pianificazione per i dettagli.</p>"
                    )
                    try:
                        # A reminder goes only to the company owner. Other
                        # employee recipients are a later configurable feature.
                        if await send_email(email, "Promemoria lavoro • Beside", content):
                            await db.calendar_reminder_claims.update_one(
                                key, {"$set": {
                                    "status": "sent",
                                    "sent_at": datetime.now(timezone.utc).isoformat(),
                                }}
                            )
                        else:
                            await db.calendar_reminder_claims.delete_one(key)
                            logger.warning("Calendar reminder email unavailable")
                    except Exception:
                        await db.calendar_reminder_claims.delete_one(key)
                        logger.exception("Calendar reminder delivery failed")
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Calendar reminder scheduler cycle failed")
        await asyncio.sleep(every_seconds)
