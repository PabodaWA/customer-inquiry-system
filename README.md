# Coffee Ninja Customer Inquiry System

A role based customer inquiry portal for registering customer requests, routing work to the right handler, and tracking each inquiry through resolution.

The repository contains a **Next.js frontend** and an **Express/PostgreSQL API**. Staff sign in through the same portal and see features for their role.

## Features

- **Intake staff** can create inquiries, attach evidence, and track inquiries they submitted.
- **Handlers** can review work assigned to them, accept or decline an assignment, and resolve accepted work.
- **Admins** can manage staff and inquiry categories, review inquiries, and reassign unassigned or declined work.
- Automatic assignment selects an active handler for the inquiry category with the lowest active workload. Ties rotate between handlers.
- Inquiry history and notifications record important workflow updates.
- Sessions are stored in PostgreSQL. Passwords are hashed with bcrypt.
- Inquiry lists support search, filters, and pagination.

## Technology

| Area | Tools |
| --- | --- |
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS 4 |
| Backend | Node.js, Express 5 |
| Database | PostgreSQL (`pg`) |
| Authentication | Express sessions, PostgreSQL session store, bcrypt |
| Tests | Node.js built-in test runner |

## Repository layout

```text
backend/
  src/controllers/       API request handlers
  src/db/migrations/     Incremental database changes
  src/middleware/        Authentication and role checks
  src/routes/            API route definitions
  src/services/          Assignment and access-control logic
  test/                  Backend tests
frontend/
  src/app/                Login and role-based pages
  src/components/         Shared UI components
  src/lib/                API and client-side helpers
```

## Requirements

- Node.js and npm
- PostgreSQL
- A baseline application database schema

### Database setup note

The SQL files in `backend/src/db/migrations` add inquiry categories, handler workflow data, evidence storage, and history actions. **They are not a complete first-install schema.** They expect the core `users`, `inquiries`, and `inquiry_history` tables to exist already. The assignment service also expects an `assignment_state` table. Those base-table definitions are not included in this repository, so create or restore the baseline schema before running the migrations.

## Local setup

Run the backend and frontend in separate terminals.

### 1. Configure PostgreSQL and the backend

Create a PostgreSQL database and make sure the baseline tables described above are present. In `backend/`, create a `.env` file:

```dotenv
DB_HOST=localhost
DB_PORT=5432
DB_NAME=customer_inquiry_system
DB_USER=postgres
DB_PASSWORD=your_local_database_password
SESSION_SECRET=replace_with_a_long_random_secret
PORT=5000
NODE_ENV=development
```

Install dependencies, apply the included migrations, and start the API:

```bash
cd backend
npm ci
npm run db:migrate
npm run dev
```

The API listens on `http://localhost:5000` by default. Check that it is running at [http://localhost:5000/api/health](http://localhost:5000/api/health).

### 2. Add local demo accounts (optional)

After the baseline schema and migrations are ready, this script inserts sample staff accounts:

```bash
cd backend
node src/seed/seedUsers.js
```

The seed script contains fixed demo passwords and uses `ON CONFLICT DO NOTHING`; use it only with a local or disposable database. Change or remove the sample credentials before exposing the app to others.

| Role | Email | Demo password |
| --- | --- | --- |
| Admin | `admin@example.com` | `Admin@123` |
| Intake | `intake@example.com` | `Intake@123` |
| General handler | `handler@example.com` | `Handler@123` |
| Technical handler | `technical@example.com` | `Technical@123` |
| Repair handler | `repair@example.com` | `Repair@123` |
| Billing handler | `billing@example.com` | `Billing@123` |

### 3. Configure and start the frontend

In `frontend/`, create `.env.local` if the API is not at the default URL:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:5000
```

Then install dependencies and start Next.js:

```bash
cd frontend
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with one of the demo accounts or an account in your database.

## Environment variables

| Variable | Used by | Required | Purpose |
| --- | --- | --- | --- |
| `DB_HOST` | Backend | Yes | PostgreSQL hostname |
| `DB_PORT` | Backend | Yes | PostgreSQL port |
| `DB_NAME` | Backend | Yes | Database name |
| `DB_USER` | Backend | Yes | Database user |
| `DB_PASSWORD` | Backend | Yes | Database password |
| `SESSION_SECRET` | Backend | Yes | Secret used to sign session cookies |
| `PORT` | Backend | No | API port; defaults to `5000` |
| `NODE_ENV` | Backend | No | Set to `production` to mark the session cookie secure |
| `NEXT_PUBLIC_API_URL` | Frontend | No | API base URL; defaults to `http://localhost:5000` |

## Role workflows

### Intake staff

1. Create an inquiry with customer details, category, description, and optional evidence.
2. The API checks for an active duplicate and attempts automatic assignment.
3. Track the inquiry, review its history, and receive status notifications.

### Handler

1. Review inquiries assigned to your account.
2. Accept a pending inquiry to move it into progress, or decline it with a reason so an admin can reassign it.
3. Resolve an accepted inquiry when the work is complete.

### Admin

1. Manage intake staff, handlers, and categories.
2. Review all inquiries and their history.
3. Reassign unassigned or declined inquiries to an active handler with the matching specialization.

## API overview

All application routes are under `/api`. Inquiry and admin endpoints require an authenticated session; admin management endpoints require the `ADMIN` role, and handler workflow endpoints require the `HANDLER` role. Inquiry access is also checked against the user's role and relationship to each inquiry.

| Route | Purpose |
| --- | --- |
| `GET /api/health` | API health check |
| `POST /api/auth/login` | Sign in |
| `GET /api/auth/me` | Get the current user |
| `POST /api/auth/logout` | Sign out |
| `GET /api/inquiries` | List inquiries visible to the current role |
| `POST /api/inquiries` | Create an inquiry (intake staff) |
| `GET /api/inquiries/:id` | View inquiry details and evidence if authorized |
| `GET /api/inquiries/:id/history` | View inquiry history if authorized |
| `POST /api/inquiries/:id/accept` | Accept a handler assignment |
| `POST /api/inquiries/:id/decline` | Return a pending assignment with a reason |
| `POST /api/inquiries/:id/resolve` | Resolve an accepted inquiry |
| `/api/admin/*` | Admin staff, category, and reassignment management |
| `/api/notifications/*` | Read notifications for the signed-in user |

## Development commands

### Backend

```bash
cd backend
npm run dev       # Start API with nodemon
npm start         # Start API normally
npm test          # Run backend tests
npm run db:migrate # Apply SQL migrations in filename order
```

### Frontend

```bash
cd frontend
npm run dev       # Start local Next.js server
npm test          # Run frontend state tests
npm run lint      # Run ESLint
npm run build     # Create a production build
npm start         # Serve the production build
```

## Security and deployment notes

- Use a unique, long `SESSION_SECRET` and strong database credentials outside local development.
- Do not use the bundled demo accounts in a shared or production environment.
- The backend currently allows browser requests from `http://localhost:3000` in its CORS configuration. Update `backend/src/app.js` for the deployed frontend origin before hosting the apps separately.
- In production, serve over HTTPS so the session cookie can use the `secure` flag.
- Evidence is sent as base64 JSON and stored in PostgreSQL. Keep uploads within the configured file type and size limits.
- Never commit `.env`, `.env.local`, or real credentials.

## Tests

Backend tests use mocked database calls and Node's built-in test runner. They cover automatic assignment, intake access restrictions, handler workflow actions, and selected authorization checks. They do not replace testing against a configured PostgreSQL database or a live browser session.
