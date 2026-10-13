# SupportDesk: Real-Time Customer Support & Ticketing System

Week 7 internship project. A full-stack support platform with customers, support agents and admins.

**Day 1:** project setup, authentication and role-based access control (RBAC).
**Day 2:** ticket management, agent assignment, status lifecycle, search, filtering and pagination.
Real-time chat (Socket.io) comes in the following days.

| | |
|---|---|
| Frontend (Vercel) | https://customer-support-system-ten.vercel.app |
| Backend API (Railway) | https://customer-support-system-production.up.railway.app/api |
| Health check | `GET /api/health` |

## Tech stack

- **Backend:** Node.js, Express 5, MongoDB (Atlas) + Mongoose 8, Zod, JWT, bcrypt, Helmet, CORS
- **Frontend:** React 19, Vite, Tailwind CSS 4, React Router 7, Axios
- **Tests:** Jest + Supertest on an in-memory MongoDB (backend), Vitest + Testing Library (frontend)

## What was built on Day 1

### Backend
- Layered structure: `routes` → `middleware` → `controllers` → `services` → `models`.
- Environment-based config and MongoDB connection (`config/db.js` takes the URI as a parameter, so tests can use an in-memory database).
- Centralized error handling: every error is returned as `{ success: false, message }`. Mongoose cast errors, duplicate keys and JWT errors are mapped to proper 400/409/401 responses, and internal error details are hidden in production.
- Request validation with Zod (`validate` middleware); invalid input returns a `400` with readable messages.
- Authentication: register, login, logout, current-user endpoint, bcrypt password hashing, JWT access token.
- RBAC with three roles: `CUSTOMER`, `AGENT`, `ADMIN`. Permissions are enforced on the backend (`protect` + `authorize`), not only in the UI.
- Admin endpoints to list users and change a user's role.
- A seed script to create the first admin.

### Frontend
- Login and register pages with client-side validation and server error display.
- `AuthContext` keeps the session, restores it on refresh via `/auth/me`, and logs the user out automatically when the API returns 401.
- Route guards: `ProtectedRoute` (must be logged in), `RoleRoute` (must have the right role, otherwise a 403 page) and `PublicRoute` (logged-in users are redirected to their dashboard).
- Role-based dashboards inside a shared sidebar layout: Customer, Agent and Admin. The Admin dashboard lists real users, supports search, and changes roles through the API.
- Accessible forms (labels, `aria-invalid`, `role="alert"`), keyboard support in the mobile menu (Escape closes it) and responsive layout.

## What was built on Day 2

### Backend
- `Ticket` model: `ticketNumber`, `subject`, `description`, `createdBy`, `assignedTo` (both reference `User`), `category`, `priority`, `status`, `resolvedAt` and timestamps, with indexes for the common queries.
- Ticket numbers (`TKT-000001`, `TKT-000002`, ...) come from an atomic counter collection, so two tickets created at the same moment can never get the same number.
- All ticket rules live in one file (`utils/ticketRules.js`): statuses, priorities, categories, the allowed status transitions and which role may perform each one. The model, validators and service all read from it.
- Customers create and manage their own tickets, agents work on the tickets assigned to them, and admins assign tickets and oversee everything.
- One list endpoint supports filtering (status, priority, category, assigned agent, creation date range), keyword search (ticket number or subject), sorting and pagination. The same query works inside each role's own scope.

### Frontend
- **Customer:** My Tickets (search, filters, sort, pagination), New Ticket form, ticket detail with edit, cancel and "confirm and close", and a dashboard with real counts.
- **Agent:** Assigned Tickets list, ticket detail where the status can be changed (only to allowed next statuses) and the priority updated, and a dashboard with real counts.
- **Admin:** All Tickets with an agent filter and an inline assign/reassign dropdown, and a ticket detail page to change status, priority, category and assignee.
- Shared building blocks: `TicketFilters`, `TicketTable`, `Pagination`, status and priority badges, and hooks (`useTicketList`, `useTicketSummary`, `usePageTitle`).
- Accessibility: colour contrast meets WCAG AA (the primary coral and the muted text colour were darkened after an audit), every page sets its own document title, a "Skip to main content" link, and keyboard focus moves into the confirmation panel and the edit form and returns afterwards.

## Ticket lifecycle and rules

Statuses: `OPEN`, `IN_PROGRESS`, `WAITING_FOR_CUSTOMER`, `RESOLVED`, `CLOSED`.

| From | To | Who can do it |
|---|---|---|
| `OPEN` | `IN_PROGRESS` | Agent (assigned to the ticket), Admin |
| `OPEN` | `CLOSED` (cancel) | Customer (own ticket), Admin |
| `IN_PROGRESS` | `WAITING_FOR_CUSTOMER`, `RESOLVED` | Agent, Admin |
| `WAITING_FOR_CUSTOMER` | `IN_PROGRESS`, `RESOLVED` | Agent, Admin |
| `RESOLVED` | `CLOSED` (customer confirms) | Customer, Admin |
| `RESOLVED` | `IN_PROGRESS` (reopen) | Agent, Admin |
| `CLOSED` | none | Closed tickets are final |

Other rules:
- **Customer edits:** `subject`, `description` and `category` can only be changed while the ticket is `OPEN`. Customers cannot change the priority (new tickets start as `MEDIUM`).
- **Agents** can change the priority of their assigned tickets. **Admins** can change the priority and category of any ticket.
- A ticket needs an assigned agent before it can move to `IN_PROGRESS`.
- Tickets can only be assigned to users with the `AGENT` role. Closed tickets cannot be reassigned or modified.
- An agent's role cannot be changed while they still have open (not `CLOSED`) tickets assigned; the API returns `409` and the admin has to reassign them first. Otherwise those tickets would be stuck with someone who can no longer open them.
- `resolvedAt` is set when a ticket is resolved, cleared when it is reopened, and kept when the customer closes it.
- A transition that does not exist returns `400`; a transition that exists but is not allowed for the caller's role returns `403`.
- A ticket outside the caller's scope (another customer's ticket, or one not assigned to the agent) returns `404`, so its existence is not revealed.

## API

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/api/health` | Public | Health check with server uptime |
| POST | `/api/auth/register` | Public | Create an account (always `CUSTOMER`) |
| POST | `/api/auth/login` | Public | Returns `{ user, token }` |
| POST | `/api/auth/logout` | Authenticated | Logout |
| GET | `/api/auth/me` | Authenticated | Current user profile |
| GET | `/api/admin/users` | `ADMIN` | List all users (optional `?role=AGENT`) |
| PATCH | `/api/admin/users/:id/role` | `ADMIN` | Change a user's role |
| POST | `/api/tickets` | `CUSTOMER` | Create a ticket |
| GET | `/api/tickets` | Authenticated | List tickets in the caller's scope (own tickets for a customer, assigned tickets for an agent) |
| GET | `/api/tickets/:id` | Authenticated | Ticket details, including `allowedNextStatuses` for the caller |
| PATCH | `/api/tickets/:id` | Authenticated | Update fields the caller's role may change |
| PATCH | `/api/tickets/:id/status` | Authenticated | Change the status (transition rules apply) |
| GET | `/api/admin/tickets` | `ADMIN` | List every ticket |
| PATCH | `/api/admin/tickets/:id/assign` | `ADMIN` | Assign or reassign a ticket to an agent |

Protected requests send `Authorization: Bearer <token>`.

### List query parameters

`GET /api/tickets` and `GET /api/admin/tickets` accept:

| Parameter | Description |
|---|---|
| `status`, `priority`, `category` | Exact filters |
| `assignedTo` | An agent id, or `unassigned` |
| `from`, `to` | Creation date range. Either `YYYY-MM-DD` (read as UTC; `to` includes the whole day) or an ISO 8601 timestamp such as `2026-02-10T09:00:00.000Z`. The web app sends the user's local day as a timestamp range, so "today" matches the user's own time zone |
| `q` | Search in ticket number and subject (case-insensitive) |
| `page`, `limit` | Pagination, default `1` and `10`, maximum limit `50` |
| `sortBy`, `order` | `createdAt` (default), `updatedAt` or `ticketNumber`; `asc` or `desc` (default) |

The response contains `data.tickets` and `pagination: { page, limit, total, pages }`.

Status codes: `400` validation, `401` missing/invalid token or wrong credentials, `403` role not allowed, `404` not found, `409` email already registered.

## Key decisions

- **Bearer token instead of cookies.** The frontend (Vercel) and backend (Railway) live on different domains. Cross-site cookies are blocked by several browsers, and Socket.io will need the same token in its handshake. A Bearer token works everywhere. Because JWTs are stateless, logout drops the token on the client; the endpoint exists for a consistent API.
- **Only the user id is stored in the token.** The role is read from the database on every request, so a role change by an admin applies immediately.
- **Roles cannot be chosen at registration.** `register` only reads `name`, `email` and `password`; every new account is a `CUSTOMER`. The first admin is created with the seed script, and further roles are assigned by an admin.
- **The same message for wrong email and wrong password**, so the API does not reveal which emails are registered.
- **An admin cannot change their own role**, which prevents locking the system out of admins.
- **Controllers vs services.** Controllers only translate HTTP; business logic lives in services so it can be reused later by Socket.io handlers.
- **One source of truth for ticket rules.** `ticketRules.js` holds the transition table. The API returns `allowedNextStatuses` with each ticket, so the frontend never duplicates the table.
- **Ownership is enforced in the database query**, not after loading the ticket: every lookup is scoped by role (`createdBy` for customers, `assignedTo` for agents), so a user cannot reach a ticket outside their scope.
- **Rate limiting on authentication.** Login allows 10 failed attempts per IP in 15 minutes (successful logins are not counted) and registration allows 20 per hour; beyond that the API returns `429` in the usual error format. The server trusts one proxy hop (`trust proxy`), because it runs behind Railway's proxy and would otherwise see every user as the same IP. Limits are skipped when `NODE_ENV=test`.
- **The list search escapes regular-expression characters**, so user input is always treated as plain text.
- **Sorting by priority is not offered**, because priorities are stored as words and would sort alphabetically (`HIGH` before `LOW` before `MEDIUM`).
- **Express 5** forwards errors from async handlers automatically, so controllers have no try/catch.
- **Mongoose is pinned to 8.x.** Mongoose 9 (MongoDB driver 7) fails inside Jest with `Missing required sub-document 'driver'`, so 8.x is used until that is resolved.

## Running locally

Requirements: Node 20+ and a MongoDB Atlas connection string.

```bash
# backend
cd backend
cp .env.example .env        # then fill in the values
npm install
npm run seed:admin          # creates the first admin from ADMIN_* variables
npm run dev                 # http://localhost:5000

# frontend (second terminal)
cd frontend
cp .env.example .env        # VITE_API_URL=http://localhost:5000/api
npm install
npm run dev                 # http://localhost:5173
```

### Environment variables (backend)

| Variable | Description |
|---|---|
| `PORT` | Server port (set automatically on Railway) |
| `NODE_ENV` | `development` / `production` |
| `MONGO_URI` | MongoDB Atlas connection string |
| `JWT_SECRET` | Long random string used to sign tokens |
| `JWT_EXPIRES_IN` | Token lifetime, e.g. `7d` |
| `CLIENT_URL` | Allowed frontend origin for CORS (no trailing slash) |
| `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Used only by the seed script |

To reset the admin password later: set `ADMIN_PASSWORD` and run `npm run seed:admin -- --reset-password`.

### Frontend

| Variable | Description |
|---|---|
| `VITE_API_URL` | Base URL of the backend API, including `/api` |

## Tests

```bash
cd backend && npm test      # 98 tests: auth, RBAC, tickets, status rules, assignment, search/filter/pagination, rate limiting
cd frontend && npm test     # 52 tests: route guards, forms, ticket lists, ticket detail per role, admin dashboard, accessibility
```

Backend tests run against `mongodb-memory-server`, so they never touch the real database. The first run downloads a MongoDB binary and can take a minute.

## Deployment

- **Backend (Railway):** root directory `backend`, start command `npm start`, health check path `/api/health`. Set the environment variables above, with `NODE_ENV=production` and `CLIENT_URL` set to the Vercel URL.
- **Frontend (Vercel):** root directory `frontend`, set `VITE_API_URL`. `vercel.json` rewrites all routes to `index.html` so React Router works on refresh.

## Project structure

```
backend/
  src/
    config/        database connection
    controllers/   HTTP layer
    middleware/    auth (protect, authorize), validation, error handling
    models/        Mongoose models (User, Ticket, Counter)
    routes/        route definitions
    scripts/       seedAdmin
    services/      business logic (auth, admin, ticket)
    utils/         AppError, constants, ticketRules
    validators/    Zod schemas
  tests/           Jest + Supertest
frontend/
  src/
    api/           axios instance and API calls
    components/    shared UI (Sidebar, Input, TicketTable, TicketFilters, ...)
    config/        navigation per role
    context/       AuthContext
    hooks/         useTicketList, useTicketSummary
    pages/         Login, Register, dashboards, ticket lists, ticket detail, new ticket, 403, 404
    routes/        route guards
    test/          Vitest tests
```

## Known limitations / next steps

- Logout is client-side only (stateless JWT); there is no token revocation list.
- Real-time chat and replies on tickets (Socket.io) are planned for the next days. Ticket detail pages do not have a conversation yet.
- Tickets cannot be unassigned (only reassigned) and cannot be deleted; they are closed instead.
- Admin settings are not built yet; that menu item is marked "Soon".
