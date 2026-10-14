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
- [ ] Audit (a11y, edge cases, security)
- [x] Postman collection (backend/SupportDesk.postman_collection.json, newman: 58 requests, 73 assertions pass)
- [x] README Day 3 section
- [ ] Deploy check (Railway WebSocket + Vercel)
- [ ] week7/Day3 snapshot + commits + push
