'use strict';

const { getPool } = require('../db/pool');

const ROLE_SUPER_ADMIN = 'super_admin';
const ROLE_ADMIN = 'admin';
const ROLE_USER = 'user';

async function load_active_user_by_id(user_id) {
    const pool = getPool();
    const [rows] = await pool.query(
        'SELECT id, username, email, role, status FROM users WHERE id = ? LIMIT 1',
        [user_id]
    );

    if (!rows || rows.length === 0) {
        return null;
    }

    const user = rows[0];
    if (String(user.status) !== 'active') {
        return null;
    }

    return user;
}

async function refresh_session_user(req) {
    if (!req.session || !req.session.user || !req.session.user.id) {
        return null;
    }

    const active_user = await load_active_user_by_id(req.session.user.id);
    if (!active_user) {
        return null;
    }

    req.session.user = {
        id: active_user.id,
        username: active_user.username,
        email: active_user.email,
        role: active_user.role
    };

    return req.session.user;
}

function require_auth(req, res, next) {
    if (!req.session || !req.session.user || !req.session.user.id) {
        return res.redirect('/login');
    }

    refresh_session_user(req)
        .then((user) => {
            if (!user) {
                req.session.destroy(() => {
                    res.redirect('/login');
                });
                return;
            }

            next();
        })
        .catch(() => {
            res.redirect('/login');
        });
}

function require_auth_json(req, res, next) {
    if (!req.session || !req.session.user || !req.session.user.id) {
        res.status(401).json({ ok: false, error: 'unauthenticated' });
        return;
    }

    refresh_session_user(req)
        .then((user) => {
            if (!user) {
                req.session.destroy(() => {
                    res.status(401).json({ ok: false, error: 'unauthenticated' });
                });
                return;
            }

            next();
        })
        .catch(() => {
            res.status(401).json({ ok: false, error: 'unauthenticated' });
        });
}

function require_role(allowed_roles) {
    const roles = Array.isArray(allowed_roles) ? allowed_roles : [];

    return (req, res, next) => {
        require_auth(req, res, () => {
            const role = String((req.session && req.session.user && req.session.user.role) ? req.session.user.role : '');
            if (!roles.includes(role)) {
                return res.status(403).render('layout', {
                    title: 'Forbidden',
                    showTopNav: true,
                    activeNav: '',
                    user: req.session.user,
                    contentView: null,
                    contentData: {
                        heading: 'Forbidden',
                        message: 'You do not have permission to access this page.'
                    }
                });
            }

            next();
        });
    };
}

function require_super_admin(req, res, next) {
    return require_role([ROLE_SUPER_ADMIN])(req, res, next);
}

function require_admin_or_super(req, res, next) {
    return require_role([ROLE_SUPER_ADMIN, ROLE_ADMIN])(req, res, next);
}

module.exports = {
    ROLE_SUPER_ADMIN,
    ROLE_ADMIN,
    ROLE_USER,
    require_auth,
    require_auth_json,
    require_role,
    require_super_admin,
    require_admin_or_super
};
