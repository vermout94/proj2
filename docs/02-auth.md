# Step 2 - Authentication and RBAC

## Goal

Implement secure authentication and role enforcement aligned with the final schema:
- `users` with roles `super_admin`, `admin`, `user`
- `password_reset_tokens` for reset flow
- active/suspended account enforcement

## Scope Implemented

- Login with peppered bcrypt verification.
- Logout with session destruction.
- Forgot password flow backed by `password_reset_tokens`.
- Reset password flow with one-time token consumption.
- Session user refresh on protected routes (user must still exist and be `active`).
- RBAC middleware for:
  - authenticated users
  - admin or super admin
  - super admin only
- Bootstrap script to create/update protected `super_admin`.

## Files Added/Updated

- `src/auth/password.js`
- `src/auth/middleware.js`
- `src/utils/tokens.js`
- `src/routes/auth.js`
- `src/routes/pages.js`
- `src/views/login.ejs`
- `src/views/forgot.ejs`
- `src/views/reset.ejs`
- `src/public/css/main.css`
- `scripts/bootstrap_super_admin.js`
- `package.json`
- `.env.example`

## Route Summary

- `GET /login`
- `POST /login`
- `POST /logout`
- `GET /forgot`
- `POST /forgot`
- `GET /reset/:token`
- `POST /reset/:token`
- `GET /dashboard` (auth required)
- `GET /admin` (admin or super admin)
- `GET /super-admin` (super admin only)

## Database Writes

### Forgot password

1. Delete old unused reset tokens for the user:
   `DELETE FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL`
2. Insert new token:
   `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) ...`

### Reset password

1. Transaction + lock token row by `token_hash`.
2. Validate: exists, not used, not expired.
3. Update `users.password_hash` and clear forced password change flag.
4. Mark all open reset tokens for that user as used.
5. Commit.

## Security Notes

- Password storage:
  `HMAC-SHA256(password, PASSWORD_PEPPER)` then `bcrypt(cost=12)`.
- Forgot response is generic to avoid user enumeration.
- Reset tokens are random 32 bytes (hex), stored only as SHA-256 hash.
- Only active users can authenticate and use reset links.
- Protected routes refresh user state from DB each request.

## Super Admin Bootstrap

Use once during initial setup or when recovering access.

```bash
cd /srv/digitalnaive
SUPER_ADMIN_USERNAME=admin \
SUPER_ADMIN_EMAIL=admin@example.com \
SUPER_ADMIN_PASSWORD='ChangeThisNow123!' \
npm run bootstrap:super-admin
```

Behavior:
- Creates the user if not present.
- Otherwise updates existing matching email/username.
- Forces role `super_admin`, `status=active`, `is_protected=1`.

## Required Environment Variables Added

- `MIN_PASSWORD_LENGTH` (default `12`)
- `PASSWORD_RESET_TTL_MINUTES` (default `60`)
- `APP_BASE_URL` (optional, used for reset links)
- `LOG_PASSWORD_RESET_LINKS` (default true in non-production)

## Manual Verification

1. Run bootstrap script and confirm one protected super admin exists.
2. Sign in with super admin.
3. Open `/admin` and `/super-admin` to verify role access.
4. Trigger `/forgot` for a valid user.
5. Use generated reset token link and reset password.
6. Confirm old password fails and new password succeeds.
7. Suspend user in DB and verify protected routes force login.
