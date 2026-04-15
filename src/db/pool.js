'use strict';

const mysql = require('mysql2/promise');
const config = require('../config');

let pool = null;

function createPool() {
    return mysql.createPool({
        host: config.db.host,
        port: config.db.port,
        user: config.db.user,
        password: config.db.pass,
        database: config.db.name,
        connectionLimit: config.db.connectionLimit,
        waitForConnections: true,
        queueLimit: 0,
        namedPlaceholders: true
    });
}

function getPool() {
    if (!pool) {
        pool = createPool();
    }
    return pool;
}

async function closePool() {
    if (pool) {
        await pool.end();
        pool = null;
    }
}

module.exports = {
    getPool,
    closePool
};
