# Step 3 - User Management Webpages

## Goal

Implement role-based user administration and user-to-drone assignment UI according to project rules.

> Note: Invite email onboarding for newly created users was added in Step 4 (`docs/04-invite-flow.md`).

## Scope Implemented

- New admin users page: `GET /admin/users`.
- Super admin actions:
  - create `admin` and `user` accounts
  - change role (`admin`/`user`)
  - change status (`active`/`suspended`)
  - set password for admin/user accounts
  - delete admin/user accounts
- Admin actions:
  - change status of `user` accounts only
  - assign/remove drone access for `admin` and `user` accounts
- Super admin drone assignment scope:
  - assign/remove drone access for `admin` and `user` accounts
  - never for `super_admin` / protected accounts
- Drone access assignment:
  - add/update `drone_user_access` with `read` or `full`
  - remove existing assignment
- Navigation update:
  - `Users` tab shown to `admin` and `super_admin`.

## Permission Enforcement

- `super_admin`:
  - full page access
  - cannot modify/delete protected or `super_admin` accounts via this UI
  - cannot perform destructive self actions (self demote/delete/suspend)
- `admin`:
  - cannot create/delete users
  - cannot edit roles/passwords
  - can only change status for `role='user'`
  - can manage drone access for `role='admin'` and `role='user'`
  - may assign drone access to the admin's own account
- Protected account (`is_protected=1`):
  - all modifications blocked

## Routes Added

- `GET /admin/users`
- `POST /admin/users/create`
- `POST /admin/users/:id/role`
- `POST /admin/users/:id/status`
- `POST /admin/users/:id/password`
- `POST /admin/users/:id/delete`
- `POST /admin/users/:id/drone-access`
- `POST /admin/users/:id/drone-access/remove`

## Files Added/Updated

- `src/models/user_management.js`
- `src/routes/admin_users.js`
- `src/views/admin_users.ejs`
- `src/app.js`
- `src/routes/pages.js`
- `src/views/layout.ejs`
- `src/views/dashboard.ejs`
- `src/public/css/main.css`

## Database Writes

- `users` inserts/updates/deletes
- `user_profiles` insert on user creation
- `drone_user_access` insert/update/delete

## Manual Verification

1. Sign in as `super_admin`, open `/admin/users`.
2. Create one `admin` and one `user`.
3. As `super_admin`, update role/status/password for those accounts.
4. Assign a drone to `user` with `read`, then change to `full`.
5. Remove assigned drone access.
6. Verify protected super admin account cannot be edited/deleted.
7. Sign in as `admin` and verify:
   - can suspend/activate `user`
   - can assign/remove drones for `admin` and `user`
   - can assign/remove drones for the admin's own account
   - cannot change role/password/delete or modify admin/super-admin accounts.
