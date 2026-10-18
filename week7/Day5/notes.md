# Week 7 - Day 1: Setup, Authentication & RBAC

## Task 1: Project Setup
- [x] Backend dependencies install
- [x] Folder structure (routes, controllers, services, models, middleware, config)
- [x] .env aur .env.example
- [x] Database connection (config/db.js)
- [x] app.js aur server.js
- [x] Health-check endpoint (GET /api/health)
- [x] Centralized error handler (AppError + errorHandler)
- [x] Request validation middleware (Zod)

## Task 2: Authentication
- [x] User model
- [x] auth.service (register, login, password hashing)
- [x] auth controller + routes (register, login, logout, me)
- [x] protect middleware (Bearer token verify)

## Task 3: Role-Based Access Control
- [x] authorize(...roles) middleware
- [x] GET /api/admin/users
- [x] PATCH /api/admin/users/:id/role

## Tests
- [x] Auth tests (register, login, logout, me)
- [x] RBAC tests (restricted routes par error)

## Frontend
- [x] Vite + Tailwind scaffold
- [x] Axios instance + AuthContext
- [x] Login aur Register pages
- [x] ProtectedRoute aur RoleRoute
- [x] Customer, Agent, Admin dashboards

## Deploy
- [x] Backend Railway par deploy (health-check OK)
- [x] Frontend Vercel par deploy
- [x] Railway CLIENT_URL ko Vercel URL par set karna
- [x] Production admin ka password strong karna

## Closing
- [x] Lint + build
- [x] Audit (a11y, edge cases)
- [x] README
- [x] week7/Day1 snapshot + commits + push

---

# Week 7 - Day 2: Tickets, Assignment & Lifecycle

## Rules pehle tay karna (code se pehle)
- [x] Statuses, transitions aur kaun kya badal sakta hai (table)
- [x] Priorities (LOW/MEDIUM/HIGH/URGENT) aur categories ki list
- [x] Customer kab edit/cancel kar sakta hai (documented rules)

## Task 1: Ticket Model
- [x] Ticket model (ticketNumber, subject, description, createdBy, assignedTo, category, priority, status, resolvedAt, timestamps)
- [x] Auto ticketNumber (TKT-000001) counter se
- [x] Indexes (status, createdBy, assignedTo, createdAt)
- [x] Status transition rules ka helper (utils)

## Task 2: Customer Tickets
- [x] Ticket validators (Zod): create, update, list query, status, assign
- [x] ticket.service: createTicket
- [x] ticket.service: listTickets (role ke hisab se scope)
- [x] ticket.service: getTicket (ownership check)
- [x] ticket.service: updateTicket (customer, sirf OPEN par)
- [x] ticket routes + controller: POST /api/tickets, GET /api/tickets, GET /api/tickets/:id, PATCH /api/tickets/:id

## Task 3: Agent + Admin
- [x] PATCH /api/tickets/:id/status (transition rules + role check)
- [x] Agent: priority change + resolve (resolvedAt set/clear)
- [x] PATCH /api/admin/tickets/:id/assign (sirf AGENT ko, reassign allowed)
- [x] GET /api/admin/tickets (sab tickets)
- [x] GET /api/admin/users?role=AGENT (assign dropdown ke liye)

## Task 4: Search, Filter, Pagination
- [x] Filters: status, priority, category, assignedTo, date range
- [x] Keyword search (ticket number ya subject)
- [x] Sorting + pagination (page, limit, total, pages)

## Tests
- [x] Ticket tests: create, list scope, ownership, edit rules
- [x] Status transition tests (valid + invalid + role)
- [x] Assignment tests (admin only, sirf agent ko)
- [x] Search/filter/pagination tests

## Frontend
- [x] ticketApi + shared components (StatusBadge, PriorityBadge, Pagination, TicketFilters, TicketTable)
- [x] Customer: My Tickets list, New Ticket form, Ticket detail (edit/close)
- [x] Agent: Assigned Tickets list, Ticket detail (status/priority/resolve)
- [x] Admin: All Tickets list, assign/reassign dropdown
- [x] Sidebar ke "Soon" items active, dashboards par real counts

## Closing
- [x] Lint + build + tests (backend + frontend)
- [x] Audit (a11y, edge cases, empty states)
- [x] README mein Day 2 section
- [x] Deploy check (Railway + Vercel)
- [x] week7/Day2 snapshot + commits + push

---

# Week 7 - Day 3: Ticket Conversations & Real-Time Updates

## Rules pehle tay karna (code se pehle)
- [x] Message rules: TEXT/SYSTEM, kaun bhej sakta hai, CLOSED par band, 2000 chars
- [x] Edit rules: sirf apna TEXT, 15 min, admin bhi dusre ka nahi, editedAt, delete nahi
- [x] Socket rules: rooms (ticket:<id>, user:<id>), join check, reassign par revoke, presence dedupe

## Task 1: Ticket Messages
- [x] TicketMessage model (ticketId, senderId, message, messageType, editedAt, timestamps) + indexes
- [x] Message validators (Zod): create, edit, list query
- [x] message.service: createMessage (scope + CLOSED check)
- [x] message.service: listMessages (limit, before cursor)
- [x] message.service: editMessage (owner, TEXT, 15 min, CLOSED check)
- [x] SYSTEM messages (assign, status change) ticket service se

## Task 2: Conversation APIs
- [x] POST /api/tickets/:id/messages
- [x] GET /api/tickets/:id/messages
- [x] PATCH /api/tickets/:id/messages/:messageId

## Task 3: Real-Time
- [x] Socket.io server + JWT handshake auth
- [x] Railway par WebSocket test (chhota version pehle deploy)
- [x] join_ticket / leave_ticket with scope check
- [x] user_joined / user_left (multi-tab dedupe)
- [x] ticket_message emit (DB save ke baad)
- [x] ticket_updated, ticket_status_changed, ticket_assigned emit
- [x] Reassign par purane agent ko room se nikalna

## Task 4: Frontend
- [x] socket client + SocketContext (auth, reconnect, status)
- [x] useTicketConversation hook (history, dedupe by _id, refetch on reconnect)
- [x] ConversationPanel: history, composer, sender + time, edit
- [x] Connection status, loading, empty, error states
- [x] Panel teeno ticket detail pages mein + live ticket_updated refresh

## Tests
- [x] Message API tests (create, list, scope, edit rules, CLOSED)
- [x] Socket tests (auth, unauthorized join, broadcast, revoke)
- [x] Frontend tests (panel, dedupe, states)

## Closing
- [x] Lint + build + tests (backend 156, frontend 84 tests)
- [x] Rate limit on sending/editing messages (20 per minute per user, 429; backend 159 tests)
- [x] Audit (a11y contrast, edge cases, security, npm audit: 0 prod vulnerabilities)
- [x] Postman collection (backend/SupportDesk.postman_collection.json, newman: 58 requests, 73 assertions pass)
- [x] README Day 3 section
- [x] Deploy check (Railway WebSocket + Vercel)
- [x] week7/Day3 snapshot + commits + push

---

# Week 7 - Day 4: Notifications, SLA Tracking & Admin Analytics

## Rules pehle tay karna (code se pehle)
- [x] SLA targets table (priority ke hisab se first response + resolution) aur "Critical" = URGENT
- [x] SLA clock rules (kab shuru, kya count hota hai, priority badalne par recalculation, reopen, cancelled)
- [x] Notification recipients table (kis event par kisko, actor ko nahi) + reply grouping
- [x] Analytics definitions (open/unresolved/resolved, averages, compliance, date range + timezone)
- [x] Charts library ka faisla (recharts ya hand-made SVG)

## Task 1: Notifications (backend)
- [x] Notification model (userId, ticketId, type, title, message, isRead, readAt, createdAt) + indexes + TTL (90 din)
- [x] utils/notificationRules.js (types, recipients, titles)
- [x] notification.service: create (best-effort, actor ko nahi), reply grouping, list (page, limit, unread), markRead, markAllRead (optional ticketId)
- [x] Events se hook: ticket create, assign, new reply, status change, resolved
- [x] Real-time: socket event "notification" -> user:<id> room (payload + unreadCount)
- [x] GET /api/notifications, PATCH /api/notifications/:id/read, PATCH /api/notifications/read-all
- [x] Validators + routes + controller

## Task 2: SLA tracking (backend)
- [x] utils/slaRules.js (targets, at-risk threshold, pure calculation functions)
- [x] Ticket model: firstResponseDueAt, resolutionDueAt, firstResponseAt, results (met/breached) + indexes
- [x] Ticket create par deadlines set karna
- [x] Priority change par pending deadlines recalculate (documented rule)
- [x] First response record karna (pehla agent/admin TEXT message, atomic)
- [x] Resolution record karna (RESOLVED par, reopen par clear)
- [x] API response mein sla block (server time ke saath: dueAt, remaining, status ON_TRACK / AT_RISK / BREACHED / MET)
- [x] Ticket list par sla filter (overdue / at_risk) + overdue count
- [x] SLA worker (background interval, atomic claim, at-risk + breach notifications, tests ke liye now inject)
- [x] Backfill script purane tickets ke liye (idempotent)

## Task 3: Admin analytics (aggregation)
- [x] GET /api/admin/analytics/overview
- [x] GET /api/admin/analytics/tickets (over time + by priority/status)
- [x] GET /api/admin/analytics/agents
- [x] GET /api/admin/analytics/sla
- [x] Date range + timezone validation, range limit, indexes

## Tests (backend)
- [x] SLA calculation tests (targets, recalculation, milestones, cancelled)
- [x] Notification tests (recipients, grouping, read/unread, read-all, scope)
- [x] SLA worker tests (idempotent, at-risk, breach)
- [x] Analytics tests (seeded data, averages, compliance, date range, non-admin 403)
- [x] Socket test: notification delivery

## Frontend
- [x] notificationApi + analyticsApi + hooks (useNotifications, useAnalytics)
- [x] Notification bell + unread badge + dropdown (real-time, mark read, mark all read)
- [x] Notifications page (full list, pagination)
- [x] SlaBadge on ticket lists + SLA card on ticket detail (server-time corrected countdown)
- [x] Overdue / at-risk filter + admin overdue card
- [x] Admin Analytics page: date-range filter, stat cards, charts
- [x] Loading, empty, error states everywhere

## Closing
- [x] Lint + build + tests (backend + frontend)
- [x] Audit (a11y, edge cases, security, indexes)
- [x] Postman collection update (notifications + analytics)
- [x] README Day 4 section (SLA rules, notification types, analytics definitions)
- [x] Deploy check (Railway worker + sockets, Vercel)
- [x] week7/Day4 snapshot + commits + push

# Week 7 - Day 5: Final integration, testing, security and deployment

Goal: prove the whole product works end to end, close the remaining security and reliability gaps, and hand over a project that someone else can install, run and review. Nothing big is added; this day is about checking, fixing and documenting.

## Where we start (checked against the code, not guessed)
- Already there: 335 backend tests and 202 frontend tests, helmet, CORS, rate limits on login / register / messages, Zod validation everywhere, indexes for tickets / messages / notifications / SLA, message pagination, socket auth + room checks, a health endpoint, `backend/.env.example` and `frontend/.env.example`.
- Gaps found: no rate limit on ticket creation; logging is `console.*` plus morgan only in development (no request ids, no production request log); no single test that walks the whole lifecycle; no screenshots; README has Railway steps (the backend now runs on Render); the root has no `.env.example` overview; the docs do not say how a fresh machine sets up the database.

## Rules for the day
- [x] Do not add features. Fix, test, document.
- [x] Every fix gets a test that fails without it.
- [x] Never log passwords, tokens or full request bodies.
- [x] Production data is never touched by tests; live checks use throwaway users and clean up after themselves.

## Task 1: End-to-end workflow validation
- [x] One backend test that walks the full lifecycle in order: register, create ticket, admin assigns, agent notified, agent opens, both exchange messages, agent resolves, customer notified, response and resolution times show in analytics, admin reads ticket history and agent performance.
- [ ] The same walk on the live site with the three roles (live script with cleanup, then a manual run by the user in three browsers).
- [x] Frontend workflow tests for the three roles where they are not covered yet (customer: register to ticket to reply; agent: open assigned ticket to resolve; admin: assign to analytics).

## Task 2: Automated tests (fill the gaps, not repeat)
- [x] Map the Day 5 list (registration/login, RBAC, ownership, assignment, status transitions, messages, socket auth and rooms, notifications read/unread, SLA, analytics, pagination/filters, invalid input) to existing test files and list what is missing.
- [x] Write the missing tests only.
- [x] Add a coverage run (`jest --coverage`) and look at the weak spots.
- [x] Record the final test results (counts, coverage) for the README.

## Task 3: Security audit
- [x] Route-by-route table of every endpoint: who may call it, and the test that proves a wrong caller is refused.
- [x] Customer cannot see or touch another customer's ticket, message or notification; agent cannot change a ticket outside their scope (tests exist; re-check each route in the table).
- [x] Socket events: validate every payload (bad ids, huge payloads, unknown events) and room membership; a bad event must not crash the server.
- [x] Input: validation and sanitising on every body, query and param; check for NoSQL operator injection and regex abuse once more.
- [x] Add a rate limit on ticket creation (and review the others).
- [x] Errors and logs: no stack traces, no passwords, no tokens, no connection strings in responses or logs.
- [x] Secrets only in environment variables; `.env` never tracked; run a scan of the git history for secrets.
- [x] Indexes: confirm with `explain` that the main list, message, notification and analytics queries use an index.
- [x] Pagination and filters cannot be abused (page and limit caps, date range caps, search length).
- [ ] Change the default admin password and document how.

## Task 4: Performance and reliability
- [x] Check that no endpoint loads all tickets or all messages (lists are paged; analytics use aggregation).
- [x] Socket reconnection and duplicate events: the client ignores an event it already applied (messages by id, notifications by id).
- [x] Ticket change and its notification stay consistent (a failed notification never fails the change; a failed change creates no notification).
- [x] Centralised logging: one small logger with levels and a request id, request log in production without bodies; replace the scattered `console.*`.
- [x] Health endpoint also reports database state (connected or not) and the version; used by the hosting health check.
- [x] Prove that an error inside one socket connection does not crash the server (test).
- [x] Graceful shutdown (stop the SLA worker, close the server and the database).
- [x] Frontend: check bundle size and the slowest screens; make sure lazy loading is used where it helps.

## Task 5: Deployment and documentation
- [ ] Production environment variables checked on Render and Vercel (CORS origin, JWT secret length, NODE_ENV).
- [x] `.env.example` files complete and without secrets (backend, frontend); a short table of every variable in the README.
- [x] Production build and start tested from a clean copy (`npm ci`, build, start).
- [x] README rewritten for a stranger: what it is, roles, install, configure, database setup (there are no migrations; indexes are created on start; seed the admin), start commands, tests, deployment (Render, Vercel), the API table, WebSocket events, ticket lifecycle, SLA rules, known limitations.
- [x] Screenshots of all three roles (login, customer tickets and conversation, agent ticket with SLA card, admin analytics, notifications) in `docs/screenshots/` and used in the README.
- [x] Postman collection brought up to date with the Render URL.
- [x] Purge the old Railway URL from the docs.
- [x] Final list of known limitations (honest, short).

## Closing
- [x] Lint + build + tests (backend and frontend) all green; test results saved.
- [ ] Final live run on Render + Vercel and the manual three-browser test by the user.
- [ ] `week7/Day5` snapshot, `week7/README.md` index, final commits and push (the user pushes).
- [ ] Submission pack: repository URL, live URLs, test results, screenshots, known limitations.

## Order of work (proposal)
1. Task 2 gap list + Task 3 route table (they find the bugs).
2. Fix what they find (Tasks 3 and 4), each with a test.
3. Task 1 lifecycle test, then live run.
4. Task 5 docs and screenshots last, so they describe the final state.
