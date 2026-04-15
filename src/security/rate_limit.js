'use strict';

const rate_limit = require('express-rate-limit');
const config = require('../config');

function create_auth_rate_limiters() {
    const login_limiter = rate_limit({
        windowMs: config.rateLimit.loginWindowMs,
        max: config.rateLimit.loginMaxAttempts,
        standardHeaders: true,
        legacyHeaders: false,
        message: 'Too many login attempts, please try again later.'
    });

    const forgot_limiter = rate_limit({
        windowMs: config.rateLimit.forgotWindowMs,
        max: config.rateLimit.forgotMaxAttempts,
        standardHeaders: true,
        legacyHeaders: false,
        message: 'Too many reset requests, please try again later.'
    });

    return {
        login_limiter,
        forgot_limiter
    };
}

module.exports = {
    create_auth_rate_limiters
};
