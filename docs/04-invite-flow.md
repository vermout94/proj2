# Step 4 - User Invite Email Flow

## Goal

Enable invite-based onboarding so newly created users set their own password through a secure one-time link.

## Scope Implemented

- Super admin user creation now uses invite flow:
  - creates account with temporary random password hash
  - sets `force_pw_change = 1`
  - creates one-time token in `password_reset_tokens`
  - sends invite email with `/reset/<token>`
- Added **Resend Invite** action for super admin.
- Forgot-password flow now also sends email via SMTP (still privacy-safe response).
- Existing manual password reset by super admin remains available.

## Behavior Details

### Create user

`POST /admin/users/create` now:
1. validates username/email/role
2. creates `users` row + empty `user_profiles` row
3. replaces open reset tokens for that user
4. inserts new reset token with invite TTL
5. sends invite email

Possible results:
- `created_invite_sent`
- `created_invite_not_sent` (user created, email failed or SMTP missing)

### Resend invite

`POST /admin/users/:id/resend-invite`:
- super admin only
- blocked for protected/super-admin/self targets
- blocked for suspended users
- rotates open reset token and sends new invite

Possible results:
- `invite_resent`
- `invite_resend_not_sent`

## SMTP Configuration

Add these env vars (service env or `.env`):

- `SMTP_HOST`
- `SMTP_PORT` (e.g. `465` or `587`)
- `SMTP_SECURE` (`true` for 465, usually `false` for 587)
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM` (e.g. `Drone Management <info@digitalnaive.net>`)
- `SMTP_TLS_REJECT_UNAUTHORIZED` (`true` recommended)

Related auth env vars:

- `APP_BASE_URL` (e.g. `https://digitalnaive.net`)
- `INVITE_TTL_MINUTES` (default `1440`)
- `PASSWORD_RESET_TTL_MINUTES` (default `60`)
- `LOG_PASSWORD_RESET_LINKS` (set `false` in production)

## Files Added/Updated

- `src/utils/mailer.js`
- `src/routes/admin_users.js`
- `src/routes/auth.js`
- `src/models/user_management.js`
- `src/views/admin_users.ejs`
- `src/config.js`
- `.env.example`
- `package.json`

## Manual Verification

1. Configure SMTP env vars and restart service.
2. Create a new user as super admin.
3. Verify user receives invite email and can set password via reset link.
4. Use **Resend Invite** and verify new link works.
5. Verify suspended users cannot receive invite resend.
