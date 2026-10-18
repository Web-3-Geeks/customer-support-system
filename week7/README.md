# Week 7: SupportDesk (Real-Time Customer Support & Ticketing System)

Each `DayN` folder is a complete, standalone copy of the project as it stood at the end of that day (cumulative, not a diff). The live, current version of the app is at the repository root.

| Folder | What it contains |
|---|---|
| `Day1/` | Project setup, authentication, role-based access control (CUSTOMER / AGENT / ADMIN), protected routes, role dashboards, admin user management, and tests |
| `Day2/` | Everything in Day 1 plus ticket management: ticket model with auto numbers, customer ticket CRUD, agent assignment and status lifecycle rules, search, filtering, sorting and pagination, customer / agent / admin ticket screens, rate limiting and accessibility fixes |
| `Day3/` | Everything in Day 2 plus threaded ticket conversations and real-time updates: message model and API (send, history with paging, time-limited edit), system lines for assignments and status changes, a Socket.IO server with authenticated connections, secure per-ticket rooms, presence, live ticket events and message rate limiting, the conversation panel for all three roles, and a Postman collection |
| `Day4/` | Everything in Day 3 plus notifications, SLA tracking and admin analytics: SLA deadlines by priority with a background worker for at-risk and breached alerts, a notification system (grouped replies, live delivery, 90-day expiry), admin analytics endpoints built on MongoDB aggregation, a notification bell and page, SLA badges and cards for staff, an Analytics page with charts, and an audit pass with fixes |
| `Day5/` | Everything in Day 4 plus the final integration work: an end-to-end lifecycle test and an access matrix test for every endpoint and role, frontend journey tests, a security and reliability audit with fixes (indexes for every list, a single secret-safe logger with request ids, startup configuration checks, tighter limits, graceful shutdown, a health check that reports the database), the move of the API to Render, complete `.env.example` files, screenshots, and a README rewritten for a new reader |
| `archive/` | Placeholder for deprecated files |

Run any day on its own: `cd DayN/backend && npm install && npm run dev`, then `cd DayN/frontend && npm install && npm run dev`. See the README inside each folder for environment variables.
