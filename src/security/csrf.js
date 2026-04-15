'use strict';

const crypto = require('crypto');

function ensure_csrf_token(req) {
    if (!req.session) {
        return '';
    }

    let token = String(req.session.csrf_token || '');
    if (token.length < 32) {
        token = crypto.randomBytes(32).toString('hex');
        req.session.csrf_token = token;
    }

    return token;
}

function safe_token_equals(expected_token, provided_token) {
    const expected = Buffer.from(String(expected_token || ''), 'utf8');
    const provided = Buffer.from(String(provided_token || ''), 'utf8');

    if (expected.length === 0 || provided.length === 0 || expected.length !== provided.length) {
        return false;
    }

    return crypto.timingSafeEqual(expected, provided);
}

function attach_csrf_token(req, res, next) {
    const token = ensure_csrf_token(req);
    req.csrf_token = token;
    res.locals.csrfToken = token;
    next();
}

function is_mutating_method(method) {
    const m = String(method || '').toUpperCase();
    return m === 'POST' || m === 'PUT' || m === 'PATCH' || m === 'DELETE';
}

function csrf_protect(req, res, next) {
    if (!is_mutating_method(req.method)) {
        next();
        return;
    }

    const expected = ensure_csrf_token(req);
    const provided = (req.body && req.body._csrf)
        ? req.body._csrf
        : (req.get('x-csrf-token') || '');

    if (!safe_token_equals(expected, provided)) {
        const accepts_json = String(req.get('accept') || '').includes('application/json');
        if (accepts_json) {
            res.status(403).json({ ok: false, error: 'invalid_csrf' });
            return;
        }

        res.status(403).render('layout', {
            title: 'Forbidden',
            showTopNav: Boolean(req.session && req.session.user),
            activeNav: '',
            user: (req.session && req.session.user) ? req.session.user : null,
            contentView: null,
            contentData: {
                heading: 'Forbidden',
                message: 'Invalid CSRF token. Reload the page and try again.'
            }
        });
        return;
    }

    next();
}

module.exports = {
    attach_csrf_token,
    csrf_protect
};
