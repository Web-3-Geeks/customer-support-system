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
- [ ] Vite + Tailwind scaffold
- [ ] Axios instance + AuthContext
- [ ] Login aur Register pages
- [ ] ProtectedRoute aur RoleRoute
- [ ] Customer, Agent, Admin dashboards

## Closing
- [ ] Lint + build
- [ ] Audit (a11y, edge cases)
- [ ] README
- [ ] week7/Day1 snapshot + commits + push
