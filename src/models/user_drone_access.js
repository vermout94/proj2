'use strict';

const { getPool } = require('../db/pool');

async function list_visible_drones_for_user(session_user) {
    const pool = getPool();

    const [rows] = await pool.query(
        'SELECT d.drone_id, d.display_name, d.is_connected, d.is_active, d.is_locked, d.last_seen_at, dua.access_level, 1 AS assigned_user_count ' +
        'FROM drone_user_access dua ' +
        'INNER JOIN drones d ON d.drone_id = dua.drone_id ' +
        'WHERE dua.user_id = ? ' +
        'ORDER BY d.drone_id ASC',
        [session_user.id]
    );

    return rows;
}

async function find_visible_drone_for_user(session_user, drone_id) {
    const pool = getPool();
    const sanitized_drone_id = String(drone_id || '').trim();

    const [rows] = await pool.query(
        'SELECT d.drone_id, d.display_name, d.is_connected, d.is_active, d.is_locked, d.last_seen_at, dua.access_level ' +
        'FROM drone_user_access dua ' +
        'INNER JOIN drones d ON d.drone_id = dua.drone_id ' +
        'WHERE dua.user_id = ? AND dua.drone_id = ? LIMIT 1',
        [session_user.id, sanitized_drone_id]
    );

    if (!rows || rows.length === 0) {
        return null;
    }
    return rows[0];
}

async function load_drone_control_parameters(drone_id) {
    const pool = getPool();
    const [rows] = await pool.query(
        'SELECT kp_ar,ki_ar,kd_ar,kp_ap,ki_ap,kd_ap,kp_rr,ki_rr,kd_rr,kp_rp,ki_rp,kd_rp,kp_ry,ki_ry,kd_ry,source,updated_at ' +
        'FROM drone_control_parameters WHERE drone_id = ? LIMIT 1',
        [drone_id]
    );

    if (!rows || rows.length === 0) {
        return null;
    }
    return rows[0];
}

async function load_drone_usage_summary(drone_id) {
    const pool = getPool();

    const [telemetry_rows] = await pool.query(
        'SELECT COUNT(*) AS count_total FROM telemetry WHERE drone_id = ?',
        [drone_id]
    );

    const [step_rows] = await pool.query(
        'SELECT COUNT(*) AS count_total FROM step_runs WHERE drone_id = ? AND is_deleted = 0',
        [drone_id]
    );

    const [latest_rows] = await pool.query(
        'SELECT received_at, is_valid, tick, roll_angle_estimate, pitch_angle_estimate, yaw_rate_setpoint, altitude_estimate ' +
        'FROM telemetry WHERE drone_id = ? ORDER BY received_at DESC LIMIT 1',
        [drone_id]
    );

    return {
        telemetry_count: Number(telemetry_rows[0].count_total || 0),
        step_run_count: Number(step_rows[0].count_total || 0),
        latest_telemetry: (latest_rows && latest_rows.length > 0) ? latest_rows[0] : null
    };
}

module.exports = {
    list_visible_drones_for_user,
    find_visible_drone_for_user,
    load_drone_control_parameters,
    load_drone_usage_summary
};
