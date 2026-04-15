'use strict';

const session = require('express-session');
const MySQLStoreFactory = require('express-mysql-session');
const config = require('../config');

let sessionMiddleware = null;

function createSessionMiddleware() {
    if (sessionMiddleware) {
        return sessionMiddleware;
    }

    const MySQLStore = MySQLStoreFactory(session);
    const store = new MySQLStore({
        host: config.db.host,
        port: config.db.port,
        user: config.db.user,
        password: config.db.pass,
        database: config.db.name,
        createDatabaseTable: true,
        schema: {
            tableName: 'sessions',
            columnNames: {
                session_id: 'session_id',
                expires: 'expires',
                data: 'data'
            }
        }
    });

    if (config.nodeEnv === 'production' && config.session.secureCookie !== true) {
        throw new Error('SESSION_COOKIE_SECURE must be true in production');
    }

    sessionMiddleware = session({
        name: config.session.cookieName,
        secret: config.session.secret,
        resave: false,
        saveUninitialized: false,
        store,
        cookie: {
            httpOnly: true,
            sameSite: 'lax',
            secure: config.session.secureCookie,
            maxAge: config.session.maxAgeMs
        }
    });

    return sessionMiddleware;
}

module.exports = { createSessionMiddleware };
