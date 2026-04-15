# Step 1 - Web Foundation

## Goal

Set up the base web application structure so the project can serve secure webpages and grow into the full user and drone management system.

This step intentionally focuses on infrastructure and a stable baseline:
- app bootstrapping
- config/env loading
- MariaDB connection pool
- session management in MariaDB
- initial layout and starter pages

## Scope Implemented

- Replaced root bootstrap with app factory flow.
- Added `src/` structure for maintainable modules.
- Added EJS view engine and static asset serving.
- Added MySQL-backed session middleware (`sessions` table).
- Added login/logout and authenticated dashboard shell.
- Added password verification with schema-aligned peppered bcrypt check:
  `HMAC-SHA256(password, PASSWORD_PEPPER)` -> `bcrypt.compare(...)`

## Files Added/Updated

- `server.js`
- `package.json`
- `src/app.js`
- `src/config.js`
- `src/db/pool.js`
- `src/auth/session.js`
- `src/routes/layout_render.js`
- `src/routes/auth.js`
- `src/routes/pages.js`
- `src/views/layout.ejs`
- `src/views/login.ejs`
- `src/views/dashboard.ejs`
- `src/public/css/main.css`

## Required Environment Variables

### Runtime

- `NODE_ENV` (default `development`)
- `HOST` (default `127.0.0.1`)
- `PORT` (default `3000`)

### Database

- `DB_HOST`
- `DB_PORT` (default `3306`)
- `DB_NAME`
- `DB_USER`
- `DB_PASS`
- `DB_CONNECTION_LIMIT` (default `10`)

### Session + Security

- `SESSION_SECRET`
- `SESSION_COOKIE_NAME` (default `sse.sid`)
- `SESSION_MAX_AGE_MS` (default `604800000`)
- `SESSION_COOKIE_SECURE` (default `true` in production, else `false`)
- `PASSWORD_PEPPER`

## Run

1. Install dependencies:
   `npm install`
2. Start server:
   `npm start`
3. Dev mode:
   `npm run dev`

## Verification Checklist

1. `GET /health` returns `200 OK`.
2. `GET /` redirects to `/login` when not authenticated.
3. Login with an active user in `users` table redirects to `/dashboard`.
4. Invalid login stays blocked and returns to `/login?err=1`.
5. `POST /logout` clears session and redirects to `/login`.
6. `sessions` table contains active session rows after login.

## Known Limitations (Expected in Step 1)

- No forgot/reset UI flow yet.
- No role-specific management pages yet.
- No drone selection and no drone management pages yet.
- No websocket flows yet.

## Next Step (Step 2)

Implement full authentication flow and RBAC middleware aligned with `super_admin`, `admin`, and `user`, including password reset via `password_reset_tokens`.
