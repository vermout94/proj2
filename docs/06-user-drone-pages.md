# Step 6 - User Drone Pages (Permission-Aware)

## Goal

Provide user-facing drone pages with strict `read`/`full` permission handling while keeping websocket command transport for a later step.

## Scope Implemented

- Added `My Drones` page:
  - `GET /my-drones`
  - lists accessible drones for current user
- Added drone detail page:
  - `GET /my-drones/:drone_id`
  - shows state, PID parameters, telemetry/step summary
- Added placeholder action endpoints:
  - `POST /my-drones/:drone_id/actions/reboot`
  - `POST /my-drones/:drone_id/actions/reconnect`
  - `POST /my-drones/:drone_id/actions/tune`
  - `POST /my-drones/:drone_id/actions/step_response`
- Added nav entry `My Drones` for all authenticated users.

## Permission Model

- All authenticated roles (`super_admin`, `admin`, `user`):
  - can see only assigned drones from `drone_user_access`
  - access level is read from `drone_user_access.access_level`

Action guard behavior:
- `full` access required for action routes
- inactive drones block action routes
- locked drones block `tune` and `step_response`
- all actions currently return placeholder success message (no websocket execution yet)

## Files Added/Updated

- `src/models/user_drone_access.js`
- `src/routes/user_drones.js`
- `src/views/my_drones.ejs`
- `src/views/my_drone_detail.ejs`
- `src/app.js`
- `src/views/layout.ejs`
- `src/views/dashboard.ejs`
- `src/public/css/main.css`

## Manual Verification

1. Login as normal `user` with assigned drones.
2. Open `/my-drones` and verify only assigned drones are visible.
3. Open one drone detail and verify access label (`read`/`full`).
4. For `read` user, action buttons are disabled and direct POST attempts are blocked.
5. For `full` user, action route returns placeholder success message.
6. Login as `admin` and verify only drones assigned to that admin are visible.
7. Open an unassigned drone URL directly and verify it returns `Drone Not Found`.
