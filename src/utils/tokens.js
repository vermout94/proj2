'use strict';

const crypto = require('crypto');
const config = require('../config');

function generate_token_hex(bytes) {
    const length = Number.isInteger(bytes) && bytes > 0 ? bytes : 32;
    return crypto.randomBytes(length).toString('hex');
}

function sha256_hex(value) {
    return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function hmac_sha256_hex(value) {
    return crypto
        .createHmac('sha256', config.security.passwordPepper)
        .update(String(value), 'utf8')
        .digest('hex');
}

module.exports = {
    generate_token_hex,
    sha256_hex,
    hmac_sha256_hex
};
