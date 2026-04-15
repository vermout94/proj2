# Step 7 - Security Hardening

## Goal

Add baseline production-grade protections for web forms and authentication flows.

## Scope Implemented

- Added HTTP security headers via `helmet`.
- Added CSRF protection for mutating requests (`POST/PUT/PATCH/DELETE`):
  - session-bound token generation
  - token validation from form `_csrf` or `x-csrf-token` header
  - all EJS forms now include CSRF hidden input
- Added auth rate limiting:
  - login endpoint limiter
  - forgot-password endpoint limiter
- Added stronger config constraints:
  - `SESSION_SECRET` minimum length
  - `PASSWORD_PEPPER` minimum length
  - `SESSION_COOKIE_SECURE` enforced in production
- Added centralized validators utility.
- Added structured audit logs for admin mutations (user/drone actions).

## Files Added/Updated

- `src/security/csrf.js`
- `src/security/rate_limit.js`
- `src/utils/validators.js`
- `src/utils/audit_logger.js`
- `src/app.js`
- `src/auth/session.js`
- `src/config.js`
- `src/routes/auth.js`
- `src/routes/admin_users.js`
- `src/routes/admin_drones.js`
- `src/views/partials/csrf_input.ejs`
- all EJS views containing POST forms
- `package.json`

## New Runtime Dependencies

- `helmet`
- `express-rate-limit`

## Environment Variables (optional tuning)

- `LOGIN_RATE_LIMIT_WINDOW_MS` (default `600000`)
- `LOGIN_RATE_LIMIT_MAX` (default `10`)
- `FORGOT_RATE_LIMIT_WINDOW_MS` (default `3600000`)
- `FORGOT_RATE_LIMIT_MAX` (default `8`)

## Manual Verification

1. Load login page and submit valid form -> works with CSRF token.
2. Remove `_csrf` from form submission (or stale token) -> request blocked with 403.
3. Repeated bad login attempts exceed threshold -> limiter blocks temporarily.
4. Repeated forgot-password requests exceed threshold -> limiter blocks temporarily.
5. Admin user/drone mutations emit `[AUDIT]` log entries.
