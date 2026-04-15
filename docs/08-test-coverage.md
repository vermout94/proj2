# Step 8 - Automated Test Coverage

## Goal

Add automated tests for critical security and authorization paths without requiring a live MariaDB instance.

## Scope Implemented

- Added integration-style tests using:
  - Node test runner (`node:test`)
  - `supertest` for HTTP assertions
  - in-memory fake DB pool for deterministic behavior

### Covered paths

1. Auth + CSRF:
   - login CSRF rejection when token missing
   - successful login/logout
   - forgot-password token generation
   - reset-password flow and credential change validation

2. RBAC:
   - user denied for admin route
   - admin allowed for admin route
   - admin denied for super-admin route
   - super-admin allowed for super-admin route

3. Invite flow:
   - super-admin creates user via invite
   - reset token is issued
   - resend-invite rotates token and sends mail again

4. User drone permission gates:
   - read-only users blocked from control actions
   - full users can reach placeholder actions
   - locked/inactive drone state gates enforced

## Files Added/Updated

- `test/step8-security-and-access.test.js`
- `test/support/fake_pool.js`
- `package.json` (dev dependency: `supertest`)

## Run

```bash
npm install
npm test
```

## Notes

- Tests use module-level DB mocking (`src/db/pool.js`) and do not require MariaDB.
- SMTP is mocked in tests; no real emails are sent.
