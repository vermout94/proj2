# Step 5 - Drone Management Webpages

## Goal

Implement admin and super-admin drone management UI with secure server-side enforcement.

## Scope Implemented

- Added drone management page: `GET /admin/drones`
- Added drone lifecycle actions:
  - create drone (with generated 64-hex token)
  - rename drone (`display_name`)
  - activate/deactivate drone (`is_active`)
  - lock/unlock drone (`is_locked`)
  - rotate token (blocked while connected)
  - delete drone with history cleanup (blocked while connected)
- Added one-time token reveal after create and rotate.
- Added top navigation link for drones.

## Routes Added

- `GET /admin/drones`
- `POST /admin/drones/create`
- `POST /admin/drones/:drone_id/rename`
- `POST /admin/drones/:drone_id/active`
- `POST /admin/drones/:drone_id/lock`
- `POST /admin/drones/:drone_id/rotate-token`
- `POST /admin/drones/:drone_id/delete`

## Permission Model

- `admin` and `super_admin` can use all drone management routes.
- `user` role cannot access drone management routes.

## Database Behavior

### Create

Transaction:
1. Insert into `drones` with:
   - `drone_token = randomBytes(32).hex` (64 chars)
   - `is_active = 1`
   - `is_locked = 0`
   - `created_by = session user id`
2. Insert default row into `drone_control_parameters`.

### Delete

Transaction:
1. Delete `step_runs` for drone.
2. Delete `drones` row.
3. FK cascades remove related rows (`drone_user_access`, PID row, telemetry, payloads through step runs).

## Safety Guards

- Drone ID validation: `^[A-Za-z0-9_-]{3,32}$`
- Display name max length: 64
- Rotate/delete blocked if `is_connected = 1`

## Files Added/Updated

- `src/models/drone_management.js`
- `src/routes/admin_drones.js`
- `src/views/admin_drones.ejs`
- `src/app.js`
- `src/views/layout.ejs`
- `src/views/dashboard.ejs`
- `src/public/css/main.css`

## Manual Verification

1. Login as admin or super admin.
2. Open `/admin/drones`.
3. Create a drone and copy displayed token.
4. Rename drone and verify listing update.
5. Toggle active and lock states.
6. Rotate token and confirm one-time token display.
7. Delete disconnected drone and verify it disappears.
