# SupportDesk: Real-Time Customer Support & Ticketing System

Week 7 internship project. A full-stack support platform with customers, support agents and admins.

**Day 1:** project setup, authentication and role-based access control (RBAC).
**Day 2:** ticket management, agent assignment, status lifecycle, search, filtering and pagination.
**Day 3:** threaded ticket conversations and real-time updates over Socket.IO.

| | |
|---|---|
| Frontend (Vercel) | https://customer-support-system-ten.vercel.app |
| Backend API (Railway) | https://customer-support-system-production.up.railway.app/api |
| Health check | `GET /api/health` |

## Tech stack

- **Backend:** Node.js, Express 5, MongoDB (Atlas) + Mongoose 8, Zod, JWT, bcrypt, Helmet, CORS
- **Frontend:** React 19, Vite, Tailwind CSS 4, React Router 7, Axios
- **Real-time:** Socket.IO (server on the same Express process, client in the React app)
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

## What was built on Day 3

### Backend
- `TicketMessage` model: `ticketId`, `senderId`, `message`, `messageType` (`TEXT` or `SYSTEM`), `editedAt` and timestamps. All message rules (limits, edit window, types) live in `utils/messageRules.js`.
- Conversation API: send a reply, read the history (newest page, "load earlier" and "catch up since message X"), and edit your own message within the time limit.
- System lines: assigning, reassigning and changing the status of a ticket also write a short `SYSTEM` message ("Status changed from open to in progress"), so the conversation doubles as a timeline.
- Socket.IO server with JWT authentication, per-ticket rooms with the same access check as the REST API, presence (who is viewing a ticket) and six real-time events.
- The ticket access rule (customer sees own tickets, agent sees assigned tickets, admin sees all) moved into one shared place (`services/ticketAccess.js`), used by the ticket service, the message service and the socket rooms.
- Rate limit on sending and editing messages.
- A Postman collection with the whole API: `backend/SupportDesk.postman_collection.json`.

### Frontend
- A conversation panel on the ticket detail page for all three roles: message history with sender, role and time, a composer, edit for your own recent messages, "load earlier messages", "jump to latest", a "here now" presence line, and system lines in the timeline.
- A connection indicator that always says what is going on in words: Live, Connecting, Reconnecting or Offline (with a "Try again" button).
- Loading, empty, error (with retry) and closed-ticket (read only) states.
- The ticket page reacts to changes made by other people: it fetches the ticket again and says what happened ("Aisha Agent changed the status to Resolved."). Ticket lists refresh when a ticket is assigned to the user.

## What was built on Day 4

### Backend
- **SLA tracking** (`utils/slaRules.js`, pure functions). Every ticket gets two deadlines when it is created: a first-response deadline and a resolution deadline. They are counted in calendar hours from creation and depend on the priority, and they are recalculated when the priority changes:

  | Priority | First response | Resolution |
  |---|---|---|
  | URGENT (critical) | 1 hour | 4 hours |
  | HIGH | 4 hours | 24 hours |
  | MEDIUM | 8 hours | 48 hours |
  | LOW | 24 hours | 120 hours |

  The SLA status is `ON_TRACK`, `AT_RISK` (a quarter of the time or less is left), `BREACHED`, `MET`, `MISSED` or `NOT_APPLICABLE`. The first staff reply stops the first-response clock; resolving the ticket stops the resolution clock. Staff get an `sla` block on tickets (with `serverTime`, so the browser counts from the server's clock); customers never see SLA data.
- **SLA worker** (`services/slaWorker.js`): every 60 seconds (`SLA_CHECK_INTERVAL_MS`) it finds tickets that became at risk or breached and notifies the assigned agent and the admins. Each alert is claimed with one atomic update, so it is sent at most once, even with several server instances. On start-up old tickets without deadlines are backfilled (`npm run backfill:sla` does the same by hand); alerts for deadlines that had already passed are marked as sent so nobody is flooded.
- **Notifications** (`Notification` model, `/api/notifications`). The person who caused an event is never notified about it. Types: `TICKET_CREATED` (admins), `TICKET_ASSIGNED` (the new agent and the customer), `STATUS_CHANGED` (the customer, and the assigned agent when someone else changed it), `NEW_REPLY` (the other side of the conversation), `SLA_AT_RISK` and `SLA_BREACHED` (assigned agent and admins).

  Replies are grouped: one unread `NEW_REPLY` per user and ticket, with a `count`. Notifications are created on a best-effort basis (a failure is logged and never fails the action), are pushed live through the socket (`notification`, `notifications_updated`), expire 90 days after their last event, and when a ticket is reassigned the previous agent's notifications about it are removed.
- **Admin analytics** (`/api/admin/analytics/*`, MongoDB aggregation only): overview, tickets over time (day / week / month), agent performance and SLA performance. Query: `from`, `to` (`YYYY-MM-DD` or an ISO timestamp), `tz` (any IANA time zone, any letter case) and `interval`. Default range is the last 30 days, the maximum is 366 days. Figures describe tickets created in the range, except the "right now" figures (overdue, at risk, unassigned, open), which are across all dates.
- New indexes for the SLA queries, and a shared page limit (`page` at most 10 000).

### Frontend
- A notification bell in the header of every dashboard with an unread badge, a dropdown with the latest notifications ("Mark all as read", "View all"), a full notifications page for each role, live updates, and a screen-reader announcement for each new notification. Escape and tabbing out close the dropdown.
- SLA for staff: a badge on ticket lists, an SLA card on the ticket page (time left or overdue by, counted from the server's clock), an SLA filter, and "Overdue" / "At risk" cards on the agent dashboard that link to the filtered lists.
- An admin Analytics page with a date-range picker and charts built with Recharts: tickets over time, status, priority and category breakdowns, agent performance and SLA performance. It is loaded lazily, so it does not make the other pages heavier.

### API added on Day 4

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/api/notifications` | Authenticated | My notifications. Query: `page`, `limit` (max 50), `unread=true` or `false`. Returns `unreadCount` too |
| PATCH | `/api/notifications/:id/read` | Owner | Mark one as read |
| PATCH | `/api/notifications/read-all` | Authenticated | Mark all as read; optional `{ ticketId }` limits it to one ticket |
| GET | `/api/admin/analytics/overview` | `ADMIN` | Totals, rates, response and resolution times, and the "right now" figures |
| GET | `/api/admin/analytics/tickets` | `ADMIN` | Created / resolved per day, week or month, plus status, priority and category breakdowns |
| GET | `/api/admin/analytics/agents` | `ADMIN` | Per-agent workload and performance |
| GET | `/api/admin/analytics/sla` | `ADMIN` | SLA met / missed by priority and overall |

### Audit fixes (found by sending hostile input to the real app)
- A search text with a control character (such as a null byte) crashed the search and answered 500; it is now rejected with 400.
- A time zone in the wrong letter case (`utc`, `asia/karachi`) made the aggregation fail with a 500; it is now accepted and converted to its official name, and an unknown name from the database is mapped to a 400.
- Absurd page numbers are capped (`page` at most 10 000) on the ticket and notification lists.
- The previous agent no longer keeps notifications (with message previews) about a ticket that was reassigned away from them.
- Accessibility: a notification with the same text twice is announced twice; the bell dropdown closes when keyboard focus leaves it.
- `npm audit --omit=dev` is clean for both apps, and no secrets are tracked in git.

## Conversation rules

| Rule | Behaviour |
|---|---|
| Who can read and write | The ticket's customer, its assigned agent and admins. Everyone else gets `404` (the ticket's existence is not revealed) |
| Message size | 1 to 2000 characters after trimming. Empty or whitespace-only messages are rejected |
| Closed tickets | No new messages and no edits (`400`). The history stays readable |
| Who can edit | Only the sender, only `TEXT` messages, only within 15 minutes of sending (`editableUntil` in the message). Not even an admin can edit someone else's message (`403`). System lines can never be edited |
| Edited messages | `editedAt` is set and the UI shows "(edited)". Sending the same text again changes nothing |
| Delete | Not offered, so the conversation stays an honest record |
| Sender | Always the logged-in user. `senderId` and `messageType` in the request body are ignored, so nobody can post as someone else or fake a system line |
| Rate limit | 20 messages or edits per minute per user (`429`). Reading is not limited |
| A message from another ticket | Editing a message through the wrong ticket returns `404` |

## Real-time (Socket.IO)

**Connecting.** The client connects to the API host (without `/api`) and sends the JWT in the handshake `auth` object, not in the URL (URLs end up in logs). A missing, invalid or expired token, or a deleted user, is rejected with `Not authenticated`; the message is the same for every cause. The user is read from the database on connect, and again on every `join_ticket`, so a role change applies straight away (and an admin changing a role also closes that user's open sockets so they reconnect with the new role).

**Rooms.**
- `ticket:<id>`: everyone allowed to read that ticket. The client asks to join with `join_ticket` and gets an acknowledgement. The server runs the same access check as the REST API; anyone else gets `Ticket not found` and never receives anything from the room.
- `user:<id>`: personal room, used for `ticket_assigned`, because a newly assigned agent is not in the ticket room yet.
- When a ticket is reassigned, the previous agent is removed from its room immediately.

**Client to server** (with an acknowledgement callback):

| Event | Payload | Acknowledgement |
|---|---|---|
| `join_ticket` | `{ ticketId }` | `{ ok: true, participants }` or `{ ok: false, message }` |
| `leave_ticket` | `{ ticketId }` | `{ ok: true }` |

**Server to client:**

| Event | Payload | When |
|---|---|---|
| `ticket_message` | `{ ticketId, message }` | A message or system line was saved, or a message was edited (same `_id`) |
| `ticket_updated` | `{ ticketId, changedFields, updatedBy }` | Priority, category, subject or description really changed |
| `ticket_status_changed` | `{ ticketId, ticketNumber, from, to, resolvedAt, changedBy }` | A status change was saved |
| `ticket_assigned` | `{ ticketId, ticketNumber, subject, assignedTo, previousAssignee, assignedBy }` | A ticket was assigned or reassigned. Also sent to the new and the previous agent without joining the room |
| `user_joined` / `user_left` | `{ ticketId, user: { id, name, role } }` | Someone opened or left the ticket. One person with several tabs counts once |

**Guarantees.**
- **Saved before broadcast.** A message is written to the database first; only then is it sent to the room. If saving fails, nobody receives anything.
- **No duplicates.** The sender gets the message in the API response and again as a socket event, with the same `_id`. The client keeps messages by `_id`, so each one is shown once, whichever arrives first.
- **No gaps after a disconnect.** Socket.IO reconnects by itself. On every (re)connect the client joins the room again and asks the API for everything newer than the last message it has (`?after=<id>`).
- **Same payload for everyone.** An event never contains role-specific data. For example it says the status changed, and the client fetches the ticket again to get its own `allowedNextStatuses`.
- **Messages are sent over REST only.** The socket is for receiving, so validation, ownership checks and rate limiting exist in one place.

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
| POST | `/api/tickets/:id/messages` | Ticket participants | Send a reply (`{ message }`). Limited to 20 per minute per user |
| GET | `/api/tickets/:id/messages` | Ticket participants | Conversation history, oldest first. Query: `limit` (default 50, max 100), `before=<messageId>` (older messages) or `after=<messageId>` (newer messages, not both). Returns `data.messages` and `hasMore` |
| PATCH | `/api/tickets/:id/messages/:messageId` | Message sender | Edit your own message within 15 minutes (`{ message }`). Limited together with sending |

Protected requests send `Authorization: Bearer <token>`. Real-time events are listed under [Real-time (Socket.IO)](#real-time-socketio).

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

Status codes: `400` validation, `401` missing/invalid token or wrong credentials, `403` role not allowed, `404` not found, `409` email already registered or conflict, `429` too many requests.

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
- **Messages are sent over REST, not over the socket.** Validation, ownership checks, rate limiting and "save before broadcast" then live in one code path, and a message is never lost because a socket dropped at the wrong moment. The socket only delivers.
- **One access rule for REST and sockets.** `ticketAccess.js` decides who may see a ticket; the ticket service, the message service and the `join_ticket` handler all use it, so the two ways in can never disagree.
- **Revoking access matters as much as granting it.** When a ticket is reassigned the previous agent is removed from the room straight away, and when an admin changes a user's role their sockets are closed, so a connection that was valid a minute ago cannot keep listening.
- **Events say what changed, not what the data is.** Everyone in a room gets the same payload, so no event can leak data meant for another role; clients fetch the ticket again for anything role specific.
- **System lines instead of a separate activity log.** Status changes and assignments are stored as `SYSTEM` messages in the same collection, so history, paging and live delivery work for them with no extra code. If writing the line fails, the change itself still stands.
- **Cursor paging on the message id.** Ids grow over time and are unique, so "older than" and "newer than" are exact even when two messages are saved in the same millisecond. The same `after` cursor is what makes catching up after a reconnect cheap.
- **A fixed edit window (15 minutes) and no delete.** Long enough to fix a typo, short enough that a conversation cannot be rewritten after the fact.
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
| `SLA_CHECK_INTERVAL_MS` | Optional. How often the SLA worker checks for at-risk and breached tickets (default 60000) |
| `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Used only by the seed script |

To reset the admin password later: set `ADMIN_PASSWORD` and run `npm run seed:admin -- --reset-password`.

### Frontend

| Variable | Description |
|---|---|
| `VITE_API_URL` | Base URL of the backend API, including `/api`. The socket connects to the same host without `/api` |
| `VITE_SOCKET_URL` | Optional. Only needed if the socket server is on a different host than the API |

## Tests

```bash
cd backend && npm test      # 335 tests: auth, RBAC, tickets, status rules, assignment, search/filter/pagination, messages, sockets, rate limiting, SLA rules and worker, notifications, analytics
cd frontend && npm test     # 202 tests: route guards, forms, ticket lists, ticket detail per role, conversation panel, live updates, notifications, SLA badges, analytics page, accessibility
```

Backend tests run against `mongodb-memory-server`, so they never touch the real database. The first run downloads a MongoDB binary and can take a minute. The socket tests start a real Socket.IO server on a free port and connect real clients to it (connection rules, room access, broadcasts, presence, reassignment, reconnection, role changes).

The Postman collection (`backend/SupportDesk.postman_collection.json`) has 73 requests with assertions. Import it, set `adminPassword`, and run the folders in order; it passed completely against a throwaway server when it was written.

## Deployment

- **Backend (Railway):** root directory `backend`, start command `npm start`, health check path `/api/health`. Set the environment variables above, with `NODE_ENV=production` and `CLIENT_URL` set to the Vercel URL.
- **WebSockets on Railway:** nothing extra to configure; the Socket.IO server runs inside the same process and port as the API. `CLIENT_URL` also decides which origin the socket accepts, so it must be exactly the Vercel URL. The WebSocket upgrade was checked on the deployed server.
- **Frontend (Vercel):** root directory `frontend`, set `VITE_API_URL`. `vercel.json` rewrites all routes to `index.html` so React Router works on refresh.

## Project structure

```
backend/
  src/
    config/        database connection
    controllers/   HTTP layer
    middleware/    auth (protect, authorize), validation, error handling
    models/        Mongoose models (User, Ticket, TicketMessage, Counter)
    routes/        route definitions
    scripts/       seedAdmin
    services/      business logic (auth, admin, ticket, message, ticketAccess)
    socket/        Socket.IO server: handshake auth, ticket rooms and presence, event emitters
    utils/         AppError, constants, ticketRules, messageRules
    validators/    Zod schemas
  tests/           Jest + Supertest + socket.io-client
  SupportDesk.postman_collection.json
frontend/
  src/
    api/           axios instance, API calls, socket client
    components/    shared UI (Sidebar, Input, TicketTable, ConversationPanel, MessageBubble, ...)
    config/        navigation per role
    context/       AuthContext, SocketContext
    hooks/         useTicketList, useTicketSummary, useTicketConversation, useNow
    pages/         Login, Register, dashboards, ticket lists, ticket detail, new ticket, 403, 404
    routes/        route guards
    test/          Vitest tests
```

## Known limitations / next steps

- Logout is client-side only (stateless JWT); there is no token revocation list.
- The rate limit and the presence list are kept in the memory of one server process. That is fine for a single Railway instance; running several instances would need a shared store (for example Redis with the Socket.IO Redis adapter).
- There is no browser-based end-to-end test: the conversation was verified with component and integration tests, a real client against a real server, and the live WebSocket handshake, but a person still needs to look at the layout on real devices.
- Messages are plain text only (no attachments, no formatting), cannot be deleted, and there are no read receipts or typing indicators.
- Tickets cannot be unassigned (only reassigned) and cannot be deleted; they are closed instead.
- Admin settings are not built yet; that menu item is marked "Soon".
- SLA clocks run in calendar hours and are not paused while the ticket waits for the customer. The worker's alerts are at-most-once: if the server is down at the exact moment, that one alert is not repeated.
- Customers cannot see SLA data (on purpose), and ticket lists can be filtered by SLA state but not sorted by urgency.
- The SLA worker runs inside the web process. Several instances are safe (alerts are claimed atomically), but a separate worker service would be cleaner at scale.
- Analytics are computed live from the tickets on every request, with no cache; that is fine at this size.
