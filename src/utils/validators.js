'use strict';

function parse_positive_int(raw_value) {
    const parsed = Number.parseInt(String(raw_value || ''), 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        return 0;
    }
    return parsed;
}

function sanitize_username(raw_value) {
    const username = String(raw_value || '').trim();
    if (!/^[A-Za-z0-9._-]{3,64}$/.test(username)) {
        return null;
    }
    return username;
}

function sanitize_email(raw_value) {
    const email = String(raw_value || '').trim().toLowerCase();
    if (email.length < 5 || email.length > 255 || !email.includes('@')) {
        return null;
    }
    return email;
}

function sanitize_drone_id(raw_value) {
    const drone_id = String(raw_value || '').trim();
    if (!/^[A-Za-z0-9_-]{3,32}$/.test(drone_id)) {
        return null;
    }
    return drone_id;
}

function parse_display_name(raw_value) {
    const value = String(raw_value || '').trim();
    if (value.length === 0) {
        return { ok: true, value: null };
    }
    if (value.length > 64) {
        return { ok: false, value: null };
    }
    return { ok: true, value: value };
}

module.exports = {
    parse_positive_int,
    sanitize_username,
    sanitize_email,
    sanitize_drone_id,
    parse_display_name
};
