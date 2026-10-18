# SupportDesk: Final Submission

Real-time customer support and ticketing system (Week 7). Customers open tickets, agents work them and chat in real time, admins assign tickets and watch volumes, workloads and SLA compliance.

## 1. Links

| | |
|---|---|
| Git repository | https://github.com/Web-3-Geeks/customer-support-system |
| Live web app | https://customer-support-system-ten.vercel.app |
| Live API health check | https://customer-support-system-api-1qcu.onrender.com/api/health |
| Full documentation | [README.md](README.md) (install, configuration, API, WebSocket events, SLA rules, security, deployment) |
| API collection | [backend/SupportDesk.postman_collection.json](backend/SupportDesk.postman_collection.json) (73 requests with assertions) |

The API runs on a free Render instance that sleeps after 15 minutes without traffic, so the very first request can take up to a minute. Open the health check link first to wake it up.

## 2. Demo: all three roles

Screenshots of the running application are in [docs/screenshots/](docs/screenshots/) and shown in the README.

| Role | What to look at | Screenshot |
|---|---|---|
| **Customer** | Dashboard, a ticket with the live conversation, the notification bell | [dashboard](docs/screenshots/02-customer-dashboard.png), [conversation](docs/screenshots/03-customer-ticket-conversation.png), [notifications](docs/screenshots/04-notifications-dropdown.png) |
| **Agent** | Dashboard with the overdue and at-risk cards, a ticket with its SLA card and status controls | [dashboard](docs/screenshots/05-agent-dashboard.png), [ticket and SLA](docs/screenshots/06-agent-ticket-sla.png) |
| **Admin** | All tickets with assignment, analytics (volumes, agent workload, SLA compliance, overdue list) | [tickets](docs/screenshots/07-admin-tickets.png), [analytics](docs/screenshots/08-admin-analytics.png) |
| **Phone** | The same ticket on a 390 px wide screen | [mobile](docs/screenshots/09-mobile-ticket.png) |

### Trying the live app (about 5 minutes)

Accounts for the agent and the admin are provided with the submission (they are not written in this public repository). A customer account can be created by anyone on the registration page.

1. Open the web app in **three browsers** (or two private windows plus one normal): log in as the admin in one, register as a customer in the second, log in as the agent in the third.
2. **Customer:** create a ticket. The admin's bell shows a live "New ticket" notification.
3. **Admin:** open the ticket and assign it to the agent. The agent and the customer are notified live.
4. **Agent:** open the ticket, check the SLA card, reply in the conversation. The customer sees the reply appear without refreshing, and their bell counts it.
5. **Agent:** change the status to *In progress*, then *Resolved*. The customer gets a "please confirm" notification and can close the ticket.
6. **Admin:** open *Analytics* and look at the numbers for the ticket just handled; open a ticket's history.
7. **Permissions:** as the customer, try the admin pages (a 403 page appears) and another customer's ticket link (not found).

Note: priority is set by staff, not by the customer (new tickets start as Medium); the admin or the assigned agent changes it on the ticket page.

## 3. Test results

| Check | Result |
|---|---|
| Backend automated tests (Jest, Supertest, real Socket.IO clients, in-memory MongoDB) | **425 passed**, 17 suites |
| Backend coverage | 98.7% statements, 91.9% branches, 98.8% functions, 99.1% lines |
| Frontend automated tests (Vitest, Testing Library) | **207 passed**, 8 files, including one journey per role |
| End-to-end lifecycle test (register, create, assign, notify, chat, resolve, analytics, review) | passed ([backend/tests/lifecycle.test.js](backend/tests/lifecycle.test.js)) |
| Access matrix (every endpoint x every kind of user) | passed ([backend/tests/accessMatrix.test.js](backend/tests/accessMatrix.test.js)) |
| Database index and query-plan checks (no collection scan, no in-memory sort on lists) | passed ([backend/tests/indexes.test.js](backend/tests/indexes.test.js)) |
| Live check against the deployed system (throwaway users, real sockets, SLA alert over the socket, database restored exactly) | **52 of 52 passed** |
| Lint (both apps), production builds (both apps), `npm audit --omit=dev` (both apps) | clean, 0 vulnerabilities |
| Production start from a clean install | boots, health is `ok`, logs are JSON with no secrets |

Run them yourself: `cd backend && npm test` and `cd frontend && npm test`. The backend tests use an in-memory database and never touch real data (the first run downloads a MongoDB binary and can take a few minutes).

## 4. Security and reliability in one paragraph

Authentication with bcrypt and HS256 JWTs; every ticket, message and notification query is scoped by role in the database query, and out-of-scope records answer 404; Zod validation on every route; rate limits on login, registration, ticket creation, messages and socket events; request-size limits; WebSocket handshake authentication, room authorization and token-expiry disconnects; secrets only in environment variables (the server refuses to start in production with a missing or weak one); a secret-safe logger with request ids; a health check that reports the database; graceful shutdown; indexes for every list. Details and the audit findings that were fixed are in the README.

## 5. Known limitations

- **Single server process.** Rate limits, presence and live pushes live in the memory of one API process. Several instances would need Redis (and the Socket.IO Redis adapter), otherwise a live push could reach the wrong instance (the data is stored, so a refresh shows it).
- **Free hosting sleeps.** The Render free plan stops the API after 15 minutes of silence, which also pauses sockets and the SLA worker until the next request. An uptime monitor on `/api/health` avoids it.
- **SLA:** calendar hours (no business-hours calendar), clocks are not paused while waiting for the customer, alerts are at-most-once, and customers cannot see SLA data (on purpose).
- **Logout is client-side.** Tokens are stateless; there is no revocation list.
- **Messages** are plain text, cannot be deleted, and have no attachments, read receipts or typing indicators.
- **Tickets** cannot be unassigned (only reassigned) or deleted; they are closed.
- **Notifications** are in-app only (no email or push). The admin "Settings" menu item is a placeholder.
- **No browser-driven end-to-end test.** The journeys are covered by component tests and real-socket backend tests, and the live site was checked with a script and by hand, but not with an automated browser.
- Analytics are computed live without a cache, which is fine at this size.

## 6. How the work was built

Five days, each kept as a complete snapshot in [week7/](week7/README.md): authentication and roles; tickets and assignment; conversations and real-time updates; notifications, SLA tracking and analytics; final integration, security audit, deployment and documentation.
