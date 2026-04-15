'use strict';

const dotenv = require('dotenv');

dotenv.config();

function requireEnv(name, fallback) {
    const value = process.env[name];
    if (value === undefined || value === '') {
        if (fallback !== undefined) {
            return fallback;
        }
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

function requireMinLength(name, value, min_length) {
    const normalized = String(value || '');
    if (normalized.length < min_length) {
        throw new Error(`${name} must be at least ${min_length} characters long`);
    }
    return normalized;
}

function toInt(name, fallback) {
    const raw = process.env[name];
    if (raw === undefined || raw === '') {
        return fallback;
    }

    const parsed = Number.parseInt(raw, 10);
    if (!Number.isInteger(parsed)) {
        throw new Error(`Invalid integer value for ${name}: ${raw}`);
    }

    return parsed;
}

function toBool(name, fallback) {
    const raw = process.env[name];
    if (raw === undefined || raw === '') {
        return fallback;
    }

    const normalized = String(raw).trim().toLowerCase();
    if (normalized === '1' || normalized === 'true' || normalized === 'yes') {
        return true;
    }
    if (normalized === '0' || normalized === 'false' || normalized === 'no') {
        return false;
    }

    throw new Error(`Invalid boolean value for ${name}: ${raw}`);
}

const nodeEnv = requireEnv('NODE_ENV', 'development');
const secureCookieDefault = (nodeEnv === 'production');

const config = {
    nodeEnv,
    host: requireEnv('HOST', '127.0.0.1'),
    port: toInt('PORT', 3000),
    db: {
        host: requireEnv('DB_HOST'),
        port: toInt('DB_PORT', 3306),
        name: requireEnv('DB_NAME'),
        user: requireEnv('DB_USER'),
        pass: requireEnv('DB_PASS'),
        connectionLimit: toInt('DB_CONNECTION_LIMIT', 10)
    },
    session: {
        secret: requireMinLength('SESSION_SECRET', requireEnv('SESSION_SECRET'), 32),
        cookieName: requireEnv('SESSION_COOKIE_NAME', 'sse.sid'),
        maxAgeMs: toInt('SESSION_MAX_AGE_MS', 7 * 24 * 60 * 60 * 1000),
        secureCookie: toBool('SESSION_COOKIE_SECURE', secureCookieDefault)
    },
    security: {
        passwordPepper: requireMinLength('PASSWORD_PEPPER', requireEnv('PASSWORD_PEPPER'), 32)
    },
    auth: {
        minPasswordLength: toInt('MIN_PASSWORD_LENGTH', 12),
        passwordResetTtlMinutes: toInt('PASSWORD_RESET_TTL_MINUTES', 60),
        inviteTtlMinutes: toInt('INVITE_TTL_MINUTES', 24 * 60),
        baseUrl: requireEnv('APP_BASE_URL', ''),
        logResetLinks: toBool('LOG_PASSWORD_RESET_LINKS', nodeEnv !== 'production')
    },
    smtp: {
        host: requireEnv('SMTP_HOST', ''),
        port: toInt('SMTP_PORT', 465),
        secure: toBool('SMTP_SECURE', true),
        user: requireEnv('SMTP_USER', ''),
        pass: requireEnv('SMTP_PASS', ''),
        from: requireEnv('SMTP_FROM', 'Drone Management <no-reply@localhost>'),
        tlsRejectUnauthorized: toBool('SMTP_TLS_REJECT_UNAUTHORIZED', true)
    },
    rateLimit: {
        loginWindowMs: toInt('LOGIN_RATE_LIMIT_WINDOW_MS', 10 * 60 * 1000),
        loginMaxAttempts: toInt('LOGIN_RATE_LIMIT_MAX', 10),
        forgotWindowMs: toInt('FORGOT_RATE_LIMIT_WINDOW_MS', 60 * 60 * 1000),
        forgotMaxAttempts: toInt('FORGOT_RATE_LIMIT_MAX', 8)
    }
};

module.exports = config;
