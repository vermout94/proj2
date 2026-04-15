'use strict';

const { getPool, closePool } = require('../src/db/pool');
const { hash_password } = require('../src/auth/password');

function required(name) {
    const value = process.env[name];
    if (!value || String(value).trim().length === 0) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return String(value).trim();
}

async function run() {
    const username = required('SUPER_ADMIN_USERNAME');
    const email = required('SUPER_ADMIN_EMAIL').toLowerCase();
    const password = required('SUPER_ADMIN_PASSWORD');

    const password_hash = await hash_password(password);
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const [rows] = await connection.query(
            'SELECT id FROM users WHERE email = ? OR username = ? LIMIT 1',
            [email, username]
        );

        if (rows && rows.length > 0) {
            const user_id = rows[0].id;
            await connection.query(
                'UPDATE users SET username = ?, email = ?, password_hash = ?, role = "super_admin", status = "active", is_protected = 1, force_pw_change = 0 WHERE id = ? LIMIT 1',
                [username, email, password_hash, user_id]
            );
            await connection.commit();
            console.log(`Updated existing user id=${user_id} as protected super_admin.`);
        } else {
            const [insert_result] = await connection.query(
                'INSERT INTO users (username, email, password_hash, role, status, is_protected, force_pw_change) VALUES (?, ?, ?, "super_admin", "active", 1, 0)',
                [username, email, password_hash]
            );
            await connection.commit();
            console.log(`Created protected super_admin user id=${insert_result.insertId}.`);
        }
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

run()
    .catch((error) => {
        console.error('[bootstrap_super_admin] failed:', error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        try {
            await closePool();
        } catch (_) {
            // ignore
        }
    });
