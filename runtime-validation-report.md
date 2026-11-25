# Runtime Validation Report

**Updated:** 2026-11-25T17:38:51+05:30  
**Target:** `D:\customer-inquiry-system`

## Summary

| Validation | Status | Exit code | Result |
|---|---|---:|---|
| Backend canonical test suite | PASS | 0 | 57 passed, 0 failed, 0 skipped |
| Frontend unit test | PASS | 0 | 1 passed, 0 failed, 0 skipped |
| Frontend ESLint | PASS | 0 | 0 errors; 11 existing `<img>` optimization warnings |
| Frontend TypeScript check | PASS | 0 | `tsc --noEmit` passed |
| Frontend compile-mode build | PASS | 0 | Routes compiled; full production build was not run |
| Browser checks | PARTIAL | n/a | Mocked logout/login and inquiry-form validation passed |
| Real database/API integration | BLOCKED | Not run | Verified migration backend is still active in an open transaction |

**Canonical automated test total:** 58 — **58 passed, 0 failed, 0 skipped**.  
**Overall:** BLOCKED — the safety gate requires resolving the active QA database transaction before creating another test database or retrying migrations.

An exploratory `node --test` discovery run also picked up `backend\test-db.js`, which performed a read-only database connectivity/time query. It was excluded from the canonical totals; no writes were performed by that probe.

## Testing Plan and Coverage

The existing Node test runner and frontend test runner were used. Tests cover authentication and role middleware, inquiry validation and ownership, duplicate-active inquiry rules, assignment selection and tie rotation, handler workflow transitions, admin input validation, evidence validation/authorization, notification ownership/read state, and frontend notification state.

| Area | Result |
|---|---|
| Authentication/session controller and middleware | Unit/controller coverage passed; persistent PostgreSQL session round-trip unverified |
| Role access and inquiry ownership | Controller tests passed for tested role/scope cases |
| Inquiry validation, duplicate checks, assignment and pagination | Controller/service tests passed; live database behavior unverified |
| Handler accept/decline/resolve transitions | Controller tests passed |
| Admin categories/staff input validation | Validation tests passed; full admin UI/API management and declined-item reassignment unverified |
| Evidence type/size/count and access scope | Controller tests passed; real upload/download flow unverified |
| Notification ownership/read state | Backend tests and one frontend unit test passed |
| Browser UI | Mocked Intake logout → login → dashboard → new inquiry navigation passed; empty submission displayed all five required-field messages |
| CORS, cookies, live API response contracts, real transactions | Not verified against a running backend and isolated database |

The browser used mock authentication responses and did not create or modify customer records.

## Database Identification and Diagnosis

- Backend configuration (`backend\.env`, `backend\src\config\database.js`) targets `customer_inquiry_db` on `localhost:5432` as `postgres`. Credentials were not printed.
- Read-only inspection connected to the maintenance database `postgres`; the server was PostgreSQL 18.6 on Windows, address `::1`, port `5432`, data directory `C:\Program Files\PostgreSQL\18\data`, started `2026-11-25T04:45:54.904Z`.
- The named QA database exists with OID `34045`. PID `189756` is still a `postgres` client backend connected to that exact QA database from `::1`; it is not the configured application database.
- The backend is `active` with transaction ID/XID `4524`, transaction/query age about 23 minutes at inspection, and no wait event. `pg_blocking_pids` is empty. It holds 52 granted locks and has 0 ungranted locks; there are no prepared transactions.
- `pg_stat_progress_create_index` reports `CREATE INDEX`, phase `initializing`, relation OID `34099`, no index relation OID yet, zero blocks/tuples progressed, and zero lockers. A read-only catalog lookup could not resolve relation OID `34099` from another session because the migration objects are uncommitted.
- The PostgreSQL log records `canceling statement due to statement timeout` while inserting into `pg_type_typname_nsp_index` at `2026-11-25 17:22:06 IST`. The configured `log_line_prefix` is only `"%t"`, so that log entry cannot be conclusively attributed to PID `189756`. Current progress evidence points to index initialization with no lock blocker; the underlying PostgreSQL/catalog cause is not established.
- Earlier targeted `pg_cancel_backend(189756)` and `pg_terminate_backend(189756)` calls returned `true`, but subsequent read-only checks still found the same active session. **No further termination or drop was attempted.** The QA database was not dropped, the shared PostgreSQL service was not stopped, and the configured application database was not modified.
- Per the requested safety gate, no second test database was created and no migration or integration suite was rerun. Live authentication/session persistence, inquiry/workflow/evidence/notification integration, transaction rollback, and CORS remain unverified.

## Environment

- Node.js `v20.19.4` was available.
- `docker info` failed because the Docker Desktop Linux-engine named pipe was missing (`//./pipe/dockerDesktopLinuxEngine`); Docker-based infrastructure could not run.

## Issues Found and Fixes

| Severity | Finding | Resolution |
|---|---|---|
| Medium | An oversized evidence base64 payload could trigger a `RangeError` during regex validation instead of a clean validation response. | Bound encoded and decoded sizes before decoding, then validate by base64 round-trip. Added regression coverage for payloads over 5 MiB. |
| Medium | Intake/Handler profile dropdowns could remain open across logout/login navigation and intercept dashboard links. | Close the dropdown before logout across Intake pages, Handler dashboard, and shared Admin layout. The mocked browser flow passed after reloading the updated frontend. |
| Environment blocker | PostgreSQL reports a timed-out catalog-index insertion; the exact QA migration session remains active in `CREATE INDEX` initialization with no lock blocker. | Root cause is not confirmed. Stop here until the exact session/transaction is safely resolved; do not drop the database or create another test DB meanwhile. |

No other confirmed product bugs were established by the executed tests. ESLint reported 11 existing `<img>` optimization warnings and no errors.

## Files Changed or Added by This QA Pass

- Backend test registration: [backend/package.json](./backend/package.json)
- Evidence validation fix: [backend/src/controllers/inquiryController.js](./backend/src/controllers/inquiryController.js)
- New backend tests: [adminValidation.test.js](./backend/test/adminValidation.test.js), [authController.test.js](./backend/test/authController.test.js), [inquiryValidation.test.js](./backend/test/inquiryValidation.test.js), [notificationController.test.js](./backend/test/notificationController.test.js)
- Profile-menu logout fixes: [Intake dashboard](./frontend/src/app/dashboard/intake/page.tsx), [Intake inquiries](./frontend/src/app/dashboard/intake/inquiries/page.tsx), [new inquiry form](./frontend/src/app/dashboard/intake/new/page.tsx), [Intake notifications](./frontend/src/app/dashboard/intake/notifications/page.tsx), [Intake settings](./frontend/src/app/dashboard/intake/settings/page.tsx), [Handler dashboard](./frontend/src/app/dashboard/handler/page.tsx), [AdminLayout](./frontend/src/components/AdminLayout.tsx)
- This report: [runtime-validation-report.md](./runtime-validation-report.md)

The worktree already contained edits in `backend\src\controllers\inquiryController.js` and `backend\test\intake-authorization.test.js` before this QA pass. Those unrelated edits were preserved; the evidence validation change was made without reverting the existing controller changes.

## Remaining Work / Manual Verification

1. Recheck PID `189756` and database `customer_inquiry_qa_8f65f6aa520f4e9a`; only after the backend has exited and no active/prepared transaction remains, clean up that exact disposable database.
2. Then create/use a separate disposable PostgreSQL test database, run the baseline migration, verify migration tracking, and execute database integration tests.
3. Verify real login/logout session-cookie persistence, protected endpoint status codes, and CORS behavior.
4. Exercise full admin staff/category management and declined-inquiry reassignment against the API.
5. Exercise live inquiry search/filter/pagination, detail/history, handler assignment/workflow, evidence upload/access, notification read/unread, and transaction rollback.
6. Run the normal production build (`npm run build`) after confirming the intended deployment environment/configuration.

## Commands and Queries Used

Successful test/build commands (run from the indicated directory):

```powershell
# backend\
node --test test\intake-authorization.test.js test\assignmentService.test.js test\handlerWorkflow.test.js test\inquiryEvidenceAccess.test.js test\authController.test.js test\adminValidation.test.js test\notificationController.test.js test\inquiryValidation.test.js

# frontend\
node --test test\notificationState.test.mjs
node .\node_modules\eslint\bin\eslint.js
node .\node_modules\typescript\bin\tsc --noEmit
node .\node_modules\next\dist\bin\next build --experimental-build-mode compile
```

Database migration and inspection:

```powershell
# Migration was attempted only on the named disposable QA database:
node scripts\migrate.js

# Docker capability check:
docker info

# Process inspection (read-only):
Get-Process -Id 189756 | Select-Object Id,ProcessName,CPU,WorkingSet64,StartTime
```

Read-only PostgreSQL checks were run with `pg` using `backend\.env` credentials while connecting to maintenance database `postgres`. The query set inspected `pg_stat_activity` (database/PID, state, transaction age, wait event, blockers and query), `pg_locks` (granted vs waiting locks), `pg_stat_progress_create_index`, `pg_prepared_xacts`, server identity/settings, and the QA database catalog row. A separate QA-DB relation lookup used `lock_timeout='1s'` and `statement_timeout='3s'`. PostgreSQL log search was restricted to the known QA PID, `pg_type_typname_nsp_index`, and statement-timeout text.

## Commands to Run Locally

From `backend\`:

```powershell
npm test
```

From `frontend\`:

```powershell
npm test
npm run lint
npx tsc --noEmit
npm run build
```
