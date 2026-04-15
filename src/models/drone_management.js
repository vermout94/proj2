'use strict';

const { getPool } = require('../db/pool');
const { hmac_sha256_hex } = require('../utils/tokens');

async function list_drones_for_admin() {
    const pool = getPool();
    const [rows] = await pool.query(
        'SELECT d.drone_id, d.display_name, d.drone_token, d.is_connected, d.is_active, d.is_locked, d.last_seen_at, d.created_at, ' +
        'COUNT(dua.id) AS assigned_user_count ' +
        'FROM drones d ' +
        'LEFT JOIN drone_user_access dua ON dua.drone_id = d.drone_id ' +
        'GROUP BY d.drone_id, d.display_name, d.drone_token, d.is_connected, d.is_active, d.is_locked, d.last_seen_at, d.created_at ' +
        'ORDER BY d.drone_id ASC'
    );
    return rows;
}

async function find_drone_by_id(drone_id) {
    const pool = getPool();
    const [rows] = await pool.query(
        'SELECT drone_id, display_name, is_connected, is_active, is_locked FROM drones WHERE drone_id = ? LIMIT 1',
        [drone_id]
    );

    if (!rows || rows.length === 0) {
        return null;
    }
    return rows[0];
}

async function create_drone_with_defaults(params) {
    const pool = getPool();
    const connection = await pool.getConnection();
    const token_hash = hmac_sha256_hex(params.drone_token);

    try {
        await connection.beginTransaction();

        await connection.query(
            'INSERT INTO drones (drone_id, drone_token, display_name, is_connected, is_active, is_locked, created_by) ' +
            'VALUES (?, ?, ?, 0, 1, 0, ?)',
            [params.drone_id, token_hash, params.display_name, params.created_by]
        );

        await connection.query(
            'INSERT INTO drone_control_parameters (' +
            'drone_id, source,' +
            'kp_ar, ki_ar, kd_ar,' +
            'kp_ap, ki_ap, kd_ap,' +
            'kp_rr, ki_rr, kd_rr,' +
            'kp_rp, ki_rp, kd_rp,' +
            'kp_ry, ki_ry, kd_ry' +
            ') VALUES (' +
            '?, "default",' +
            '0,0,0,' +
            '0,0,0,' +
            '0,0,0,' +
            '0,0,0,' +
            '0,0,0' +
            ')',
            [params.drone_id]
        );

        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

async function update_drone_name(drone_id, display_name) {
    const pool = getPool();
    const [result] = await pool.query(
        'UPDATE drones SET display_name = ? WHERE drone_id = ? LIMIT 1',
        [display_name, drone_id]
    );
    return result.affectedRows;
}

async function update_drone_active(drone_id, is_active) {
    const pool = getPool();
    const [result] = await pool.query(
        'UPDATE drones SET is_active = ? WHERE drone_id = ? LIMIT 1',
        [is_active ? 1 : 0, drone_id]
    );
    return result.affectedRows;
}

async function update_drone_lock(drone_id, is_locked) {
    const pool = getPool();
    const [result] = await pool.query(
        'UPDATE drones SET is_locked = ? WHERE drone_id = ? LIMIT 1',
        [is_locked ? 1 : 0, drone_id]
    );
    return result.affectedRows;
}

async function rotate_drone_token(drone_id, drone_token) {
    const pool = getPool();
    const [result] = await pool.query(
        'UPDATE drones SET drone_token = ? WHERE drone_id = ? LIMIT 1',
        [drone_token, drone_id]
    );
    return result.affectedRows;
}

async function delete_drone_cascade(drone_id) {
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        await connection.query(
            'DELETE FROM step_runs WHERE drone_id = ?',
            [drone_id]
        );

        const [result] = await connection.query(
            'DELETE FROM drones WHERE drone_id = ? LIMIT 1',
            [drone_id]
        );

        await connection.commit();
        return result.affectedRows;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

module.exports = {
    list_drones_for_admin,
    find_drone_by_id,
    create_drone_with_defaults,
    update_drone_name,
    update_drone_active,
    update_drone_lock,
    rotate_drone_token,
    delete_drone_cascade
};
