'use strict';

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const config = require('../config');

const PASSWORD_COST = 12;

function pepper_password(plain_password) {
    return crypto
        .createHmac('sha256', config.security.passwordPepper)
        .update(String(plain_password), 'utf8')
        .digest('hex');
}

async function hash_password(plain_password) {
    const peppered = pepper_password(plain_password);
    return bcrypt.hash(peppered, PASSWORD_COST);
}

async function verify_password(plain_password, password_hash) {
    const peppered = pepper_password(plain_password);
    return bcrypt.compare(peppered, String(password_hash || ''));
}

module.exports = {
    hash_password,
    verify_password
};
