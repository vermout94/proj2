'use strict';

const { getPool } = require('../db/pool');

async function list_users_with_core_fields() {
    const pool = getPool();
    const [rows] = await pool.query(
        'SELECT id, username, email, role, status, is_protected, created_at ' +
        'FROM users ORDER BY id ASC'
    );
    return rows;
}

async function find_user_by_id(user_id) {
    const pool = getPool();
    const [rows] = await pool.query(
        'SELECT id, username, email, role, status, is_protected FROM users WHERE id = ? LIMIT 1',
        [user_id]
    );

    if (!rows || rows.length === 0) {
        return null;
    }

    return rows[0];
}

async function list_drones_for_assignment() {
    const pool = getPool();
    const [rows] = await pool.query(
        'SELECT drone_id, display_name, is_active, is_connected FROM drones ORDER BY drone_id ASC'
    );
    return rows;
}

async function list_drone_access_for_all_users() {
    const pool = getPool();
    const [rows] = await pool.query(
        'SELECT dua.id, dua.user_id, dua.drone_id, dua.access_level, dua.granted_at, dua.granted_by, ' +
        'd.display_name, d.is_active, d.is_connected ' +
        'FROM drone_user_access dua ' +
        'INNER JOIN drones d ON d.drone_id = dua.drone_id ' +
        'ORDER BY dua.user_id ASC, dua.drone_id ASC'
    );
    return rows;
}

async function create_user_with_profile(params) {
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const [insert_result] = await connection.query(
            'INSERT INTO users (username, email, password_hash, role, status, is_protected, force_pw_change) ' +
            'VALUES (?, ?, ?, ?, "active", 0, ?)',
            [params.username, params.email, params.password_hash, params.role, params.force_pw_change ? 1 : 0]
        );

        await connection.query(
            'INSERT INTO user_profiles (user_id) VALUES (?)',
            [insert_result.insertId]
        );

        await connection.commit();
        return insert_result.insertId;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

async function replace_open_reset_tokens(user_id, token_hash, expires_at) {
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();
        await connection.query(
            'DELETE FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL',
            [user_id]
        );
        await connection.query(
            'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
            [user_id, token_hash, expires_at]
        );
        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

async function update_user_role(user_id, role) {
    const pool = getPool();
    const [result] = await pool.query(
        'UPDATE users SET role = ? WHERE id = ? LIMIT 1',
        [role, user_id]
    );
    return result.affectedRows;
}

async function update_user_status(user_id, status) {
    const pool = getPool();
    const [result] = await pool.query(
        'UPDATE users SET status = ? WHERE id = ? LIMIT 1',
        [status, user_id]
    );
    return result.affectedRows;
}

async function update_user_password(user_id, password_hash) {
    const pool = getPool();
    const [result] = await pool.query(
        'UPDATE users SET password_hash = ?, force_pw_change = 0 WHERE id = ? LIMIT 1',
        [password_hash, user_id]
    );
    return result.affectedRows;
}

async function update_force_password_change(user_id, force_pw_change) {
    const pool = getPool();
    const [result] = await pool.query(
        'UPDATE users SET force_pw_change = ? WHERE id = ? LIMIT 1',
        [force_pw_change ? 1 : 0, user_id]
    );
    return result.affectedRows;
}

async function delete_user_by_id(user_id) {
    const pool = getPool();
    const [result] = await pool.query(
        'DELETE FROM users WHERE id = ? LIMIT 1',
        [user_id]
    );
    return result.affectedRows;
}

async function drone_exists(drone_id) {
    const pool = getPool();
    const [rows] = await pool.query(
        'SELECT drone_id FROM drones WHERE drone_id = ? LIMIT 1',
        [drone_id]
    );
    return !!(rows && rows.length > 0);
}

async function upsert_drone_access(params) {
    const pool = getPool();
    const [result] = await pool.query(
        'INSERT INTO drone_user_access (drone_id, user_id, access_level, granted_by) ' +
        'VALUES (?, ?, ?, ?) ' +
        'ON DUPLICATE KEY UPDATE access_level = VALUES(access_level), granted_by = VALUES(granted_by), granted_at = NOW()',
        [params.drone_id, params.user_id, params.access_level, params.granted_by]
    );
    return result.affectedRows;
}

async function remove_drone_access(params) {
    const pool = getPool();
    const [result] = await pool.query(
        'DELETE FROM drone_user_access WHERE user_id = ? AND drone_id = ? LIMIT 1',
        [params.user_id, params.drone_id]
    );
    return result.affectedRows;
}

module.exports = {
    list_users_with_core_fields,
    find_user_by_id,
    list_drones_for_assignment,
    list_drone_access_for_all_users,
    create_user_with_profile,
    replace_open_reset_tokens,
    update_user_role,
    update_user_status,
    update_user_password,
    update_force_password_change,
    delete_user_by_id,
    drone_exists,
    upsert_drone_access,
    remove_drone_access
};
