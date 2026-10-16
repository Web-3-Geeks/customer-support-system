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
- [ ] Charts library ka faisla (recharts ya hand-made SVG)

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
- [ ] notificationApi + analyticsApi + hooks (useNotifications, useAnalytics)
- [ ] Notification bell + unread badge + dropdown (real-time, mark read, mark all read)
- [ ] Notifications page (full list, pagination)
- [ ] SlaBadge on ticket lists + SLA card on ticket detail (server-time corrected countdown)
- [ ] Overdue / at-risk filter + admin overdue card
- [ ] Admin Analytics page: date-range filter, stat cards, charts
- [ ] Loading, empty, error states everywhere

## Closing
- [ ] Lint + build + tests (backend + frontend)
- [ ] Audit (a11y, edge cases, security, indexes)
- [ ] Postman collection update (notifications + analytics)
- [ ] README Day 4 section (SLA rules, notification types, analytics definitions)
- [ ] Deploy check (Railway worker + sockets, Vercel)
- [ ] week7/Day4 snapshot + commits + push
