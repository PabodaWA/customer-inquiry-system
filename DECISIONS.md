# Design Decisions

## Assumptions

- Intake staff are responsible for registering customer inquiries; handlers work only on inquiries assigned to them; admins manage staff, categories, and reassignment.
- An inquiry should be routed to an active handler whose specialization matches its category. If none is available, the inquiry remains pending for later admin action.
- Inquiry history and evidence need to remain available to users authorized to view that inquiry.
- This project extends an existing PostgreSQL baseline schema. The repository migrations are incremental and assume core tables already exist.

## Design choices

### 1. Enforce role and ownership checks in the API

The API scopes list, detail, evidence, and history access to the signed-in user's role and relationship to each inquiry. Handler workflow endpoints also check that the inquiry is assigned to that handler and is in the expected state. The frontend can guide the workflow, but the API is the authority for access decisions.

### 2. Assign by active workload, then rotate ties

Automatic assignment chooses an active handler for the inquiry category with the lowest count of active inquiries across categories. When handlers have equal workloads, a per-category cursor rotates the next selection. This balances overall work while giving equal-load handlers a predictable turn.

### 3. Keep assignment events and inquiry history

The current assignment lives on the inquiry, while `inquiry_assignments` preserves each assignment attempt and its outcome. `inquiry_history` records broader workflow events. This allows the app to show the current state without losing the path that led there.

## Accepted trade-off

Evidence files are validated and stored in PostgreSQL as binary data, then returned to authorized clients as data URLs. This keeps inquiry details and their attachments together and avoids adding a separate storage service. The trade-off is database growth and larger API payloads, so uploads are limited by type, count, and size.

## What I would improve next

Add a complete baseline schema migration, including the core user, inquiry, history, and assignment-state tables, so a new developer can initialize a database from this repository alone. After that, add integration tests against a disposable PostgreSQL database and make the frontend CORS origin configurable for deployment.
