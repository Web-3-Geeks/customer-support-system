# Week 7: SupportDesk (Real-Time Customer Support & Ticketing System)

Each `DayN` folder is a complete, standalone copy of the project as it stood at the end of that day (cumulative, not a diff). The live, current version of the app is at the repository root.

| Folder | What it contains |
|---|---|
| `Day1/` | Project setup, authentication, role-based access control (CUSTOMER / AGENT / ADMIN), protected routes, role dashboards, admin user management, and tests |
| `Day2/` | Everything in Day 1 plus ticket management: ticket model with auto numbers, customer ticket CRUD, agent assignment and status lifecycle rules, search, filtering, sorting and pagination, customer / agent / admin ticket screens, rate limiting and accessibility fixes |
| `archive/` | Placeholder for deprecated files |

Run any day on its own: `cd DayN/backend && npm install && npm run dev`, then `cd DayN/frontend && npm install && npm run dev`. See the README inside each folder for environment variables.
