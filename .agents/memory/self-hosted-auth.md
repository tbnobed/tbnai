---
name: Self-hosted auth only
description: User rejected Clerk; auth must be fully self-hosted (email/password, sessions in own Postgres).
---

The user explicitly refused any third-party auth ("we are not using Clerk"). Clerk was fully removed (July 31, 2026) and replaced with self-hosted email/password auth: scrypt hashes in a `users` table, Postgres-backed express-session cookies, admin account bootstrapped from `ADMIN_EMAIL`/`ADMIN_PASSWORD` env vars, staff invited with generated temp passwords.

**Why:** Deployment is self-hosted Docker Compose with no external service dependencies; the user was adamant.

**How to apply:** Never reintroduce Clerk or any hosted auth provider (Replit Auth included). Auth changes go through the session-based system; admin credentials live in `.env`.
