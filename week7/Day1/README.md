# SupportDesk: Real-Time Customer Support & Ticketing System

Week 7 internship project. A full-stack support platform with customers, support agents and admins.

**Day 1 scope:** project setup, authentication and role-based access control (RBAC). Ticketing and real-time chat (Socket.io) come in the following days.

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

## API

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/api/health` | Public | Health check with server uptime |
| POST | `/api/auth/register` | Public | Create an account (always `CUSTOMER`) |
| POST | `/api/auth/login` | Public | Returns `{ user, token }` |
| POST | `/api/auth/logout` | Authenticated | Logout |
| GET | `/api/auth/me` | Authenticated | Current user profile |
| GET | `/api/admin/users` | `ADMIN` | List all users |
| PATCH | `/api/admin/users/:id/role` | `ADMIN` | Change a user's role |

Protected requests send `Authorization: Bearer <token>`.

Status codes: `400` validation, `401` missing/invalid token or wrong credentials, `403` role not allowed, `404` not found, `409` email already registered.

## Key decisions

- **Bearer token instead of cookies.** The frontend (Vercel) and backend (Railway) live on different domains. Cross-site cookies are blocked by several browsers, and Socket.io will need the same token in its handshake. A Bearer token works everywhere. Because JWTs are stateless, logout drops the token on the client; the endpoint exists for a consistent API.
- **Only the user id is stored in the token.** The role is read from the database on every request, so a role change by an admin applies immediately.
- **Roles cannot be chosen at registration.** `register` only reads `name`, `email` and `password`; every new account is a `CUSTOMER`. The first admin is created with the seed script, and further roles are assigned by an admin.
- **The same message for wrong email and wrong password**, so the API does not reveal which emails are registered.
- **An admin cannot change their own role**, which prevents locking the system out of admins.
- **Controllers vs services.** Controllers only translate HTTP; business logic lives in services so it can be reused later by Socket.io handlers.
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
cd backend && npm test      # 22 tests: registration, login, /me, logout, RBAC
cd frontend && npm test     # 14 tests: route guards, forms, logout, admin dashboard
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
    models/        Mongoose models
    routes/        route definitions
    scripts/       seedAdmin
    services/      business logic
    utils/         AppError, constants
    validators/    Zod schemas
  tests/           Jest + Supertest
frontend/
  src/
    api/           axios instance and API calls
    components/    shared UI (Sidebar, Input, Button, ...)
    config/        navigation per role
    context/       AuthContext
    pages/         Login, Register, dashboards, 403, 404
    routes/        route guards
    test/          Vitest tests
```

## Known limitations / next steps

- Logout is client-side only (stateless JWT); there is no token revocation list.
- Ticket creation, ticket assignment and priorities, and real-time chat with Socket.io are planned for the next days. The dashboards currently show placeholders for these.
- Dashboard menu items marked "Soon" are not active yet.
