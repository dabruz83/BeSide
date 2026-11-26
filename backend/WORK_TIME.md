# Work time — phase 1

Additive changes only. `WORK_TIME_ENABLED` defaults to true; false hides the UI and rejects writes. Authentication and company-role dependencies are unchanged.

## Database prerequisite

MongoDB must support multi-document transactions (replica set or sharded cluster). A standalone MongoDB cannot safely enable writes; the API returns 503 without saving a partial operation. No deployment or infrastructure conversion is performed by this change. Verify topology before activating this feature in a deployed environment.

Startup calls `ensure_work_time_indexes`. New collections:
- `work_time_sessions`: UTC dates, effective accumulated seconds, revision, one open session per user enforced by a partial unique index.
- `work_time_events`: actor, timestamps, before/after snapshots for every lifecycle action and manual correction.
- `work_time_operations`: durable idempotency receipts, scoped to tenant and actor. Do not TTL/prune without defining the retry horizon.
- `work_time_locks`: transaction contention point per worker, covering manual intervals and timer actions.
- `work_time_activities`: tenant-owned names with case-insensitive normalized unique keys; archival preserves history.

No backfill or update of existing hours is needed. Jobs gain `estimated_work_hours` only when explicitly entered and `work_time_has_sessions` with the first session. Existing `hours_worked`, financial calculations, quotes and completion/delivery flags are untouched. Jobs with recorded sessions cannot be deleted individually; the existing tenant account-deletion workflow also clears the new collections.

Each write transaction serializes operations for the affected worker and saves the session, audit event and idempotency receipt together. Actions carry a revision to reject stale device commands. Interval overlap is checked conservatively across the whole recorded start/end interval, including internal pauses; different workers may overlap. Activity renaming changes its current display name without rewriting session records.

Manual start/end input uses the device timezone and is converted to UTC; ambiguous DST local times should be entered using the intended device timezone. History groups sessions by the local start date and shows full start/end dates for sessions spanning midnight. No automatic midnight splitting or financial billing is performed. Nullable hourly cost/rate snapshots reserve space for later phases.

The browser uses a one-second repaint based on the last server duration and elapsed wall-clock time, never sending frontend elapsed seconds for timer operations. It re-reads on startup, focus/visibility, reconnect, and every 15 seconds. An uncertain write is kept locally with its original id; the explicit retry button reuses that id even after reopening. No new write is allowed until the pending operation is resolved. Switching jobs requires explicit consent and confirmation that the previous session ended.

## Targeted tests

`backend/tests/test_work_time.py` uses only `mongodb://127.0.0.1:27127/?replicaSet=worktime_test` and fresh `beside_test_work_time_*` databases. It tests real transactions, idempotency, conflicts, overlap, roles, tenant isolation, multiple workers, UTC durations, multi-day sessions and fresh-client recovery. The local test replica set is disposable and is never a deployment database.

`npm --prefix frontend test` includes work-time clock/progress tests and simulated lost-response/PWA reopening and double-click tests. Physical iOS background/PWA lifecycle must also be validated on a real device before release; responsive browser testing alone does not certify iOS behavior.

## Resume verification — 2026-11-25

Read-only Railway inspection: BeSide staging (`168135ce-6410-4890-8eff-ea6578b813c1`) uses `mongo:8.0`, with live start command `docker-entrypoint.sh mongod --ipv6 --bind_ip ::,0.0.0.0 --setParameter diagnosticDataCollectionEnabled=false`. No `--replSet` or configuration-file argument is present. This is standalone configuration and blocks transactional time tracking. Beside-Agency has only an environment named production; its Mongo service also uses the standard `mongo:8.0` image without a custom replica-set command. No database, infrastructure, variables or deployment was changed. Runtime `hello` was not executed: Mongo has no public TCP endpoint. A supported topology must be authorized and verified before release.

Resume UI checks used the actual WorkTime components with in-memory fixtures only: nested finish confirmation, cancel preserving the session, explicit finish, manual form, and a 390px viewport. A grid minimum-width overflow was fixed; dialog clientWidth and scrollWidth both measure 348px. No browser console errors. These checks do not replace a physical iPhone/PWA test or an end-to-end test on staging with a transaction-capable database. Previously passed replica-set backend and provider tests were not repeated.
