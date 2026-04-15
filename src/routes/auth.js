'use strict';

const express = require('express');

const config = require('../config');
const { getPool } = require('../db/pool');
const { create_auth_rate_limiters } = require('../security/rate_limit');
const { hash_password, verify_password } = require('../auth/password');
const { generate_token_hex, sha256_hex } = require('../utils/tokens');
const { send_text_mail } = require('../utils/mailer');
const { renderLayout } = require('./layout_render');

const router = express.Router();
const { login_limiter, forgot_limiter } = create_auth_rate_limiters();

function reset_link(req, raw_token) {
    const configured_base_url = String(config.auth.baseUrl || '').trim();
    if (configured_base_url.length > 0) {
        return `${configured_base_url.replace(/\/+$/, '')}/reset/${raw_token}`;
    }

    const proto = String(req.protocol || 'http');
    const host = String(req.get('host') || '');
    return `${proto}://${host}/reset/${raw_token}`;
}

async function load_valid_reset_token(raw_token) {
    const token_hash = sha256_hex(raw_token);
    const pool = getPool();
    const [rows] = await pool.query(
        'SELECT prt.id, prt.user_id FROM password_reset_tokens prt ' +
        'INNER JOIN users u ON u.id = prt.user_id ' +
        'WHERE prt.token_hash = ? AND prt.used_at IS NULL AND prt.expires_at > NOW() AND u.status = "active" ' +
        'LIMIT 1',
        [token_hash]
    );

    if (!rows || rows.length === 0) {
        return null;
    }

    return rows[0];
}

router.get('/login', (req, res) => {
    if (req.session && req.session.user) {
        return res.redirect('/dashboard');
    }

    const error = (req.query && req.query.err === '1') ? 'Invalid email or password.' : null;
    const info = (req.query && req.query.reset === '1') ? 'Password reset successful. Please sign in.' : null;
    return renderLayout(res, {
        title: 'Login',
        showTopNav: false,
        contentView: 'login',
        contentData: { error, info }
    });
});

router.post('/login', login_limiter, async (req, res) => {
    const email = String((req.body && req.body.email) ? req.body.email : '').trim().toLowerCase();
    const password = String((req.body && req.body.password) ? req.body.password : '');

    if (!email || !password) {
        return res.redirect('/login?err=1');
    }

    try {
        const pool = getPool();
        const [rows] = await pool.query(
            'SELECT id, username, email, password_hash, role, status FROM users WHERE email = ? LIMIT 1',
            [email]
        );

        if (!rows || rows.length === 0) {
            return res.redirect('/login?err=1');
        }

        const user = rows[0];
        if (String(user.status) !== 'active') {
            return res.redirect('/login?err=1');
        }

        const ok = await verify_password(password, String(user.password_hash || ''));
        if (!ok) {
            return res.redirect('/login?err=1');
        }

        req.session.regenerate((error) => {
            if (error) {
                return res.redirect('/login?err=1');
            }

            req.session.user = {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role
            };

            return res.redirect('/dashboard');
        });
    } catch (_) {
        return res.redirect('/login?err=1');
    }
});

router.post('/logout', (req, res) => {
    if (!req.session) {
        return res.redirect('/login');
    }

    req.session.destroy(() => {
        res.clearCookie(config.session.cookieName);
        return res.redirect('/login');
    });
});

router.get('/forgot', (req, res) => {
    const sent = (req.query && req.query.sent === '1');
    return renderLayout(res, {
        title: 'Forgot Password',
        showTopNav: false,
        contentView: 'forgot',
        contentData: { sent }
    });
});

router.post('/forgot', forgot_limiter, async (req, res) => {
    const email = String((req.body && req.body.email) ? req.body.email : '').trim().toLowerCase();

    if (!email) {
        return res.redirect('/forgot?sent=1');
    }

    try {
        const pool = getPool();
        const [rows] = await pool.query(
            'SELECT id, email, status FROM users WHERE email = ? LIMIT 1',
            [email]
        );

        if (rows && rows.length > 0 && String(rows[0].status) === 'active') {
            const user_id = rows[0].id;
            const raw_token = generate_token_hex(32);
            const token_hash = sha256_hex(raw_token);
            const expires_at = new Date(Date.now() + (config.auth.passwordResetTtlMinutes * 60 * 1000));

            await pool.query(
                'DELETE FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL',
                [user_id]
            );

            await pool.query(
                'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
                [user_id, token_hash, expires_at]
            );

            const link = reset_link(req, raw_token);
            const text =
                `Reset your Drone Management password:\n${link}\n\n` +
                `This link expires in ${config.auth.passwordResetTtlMinutes} minutes.\n`;

            const mail_result = await send_text_mail(email, 'Drone Management password reset', text);
            if (config.auth.logResetLinks === true) {
                console.log(`[AUTH] Password reset link for ${email}: ${link}`);
                if (mail_result.ok !== true) {
                    console.log(`[AUTH] Password reset email not sent for ${email}: ${mail_result.error || 'unknown_error'}`);
                }
            }
        }
    } catch (error) {
        console.error('[AUTH] forgot password failed', error);
    }

    return res.redirect('/forgot?sent=1');
});

router.get('/reset/:token', async (req, res) => {
    const raw_token = String((req.params && req.params.token) ? req.params.token : '').trim();
    if (!/^[a-f0-9]{64}$/i.test(raw_token)) {
        return res.status(400).render('layout', {
            title: 'Reset Password',
            showTopNav: false,
            activeNav: '',
            user: null,
            contentView: null,
            contentData: {
                heading: 'Invalid or expired link',
                message: 'Please request a new password reset link.'
            }
        });
    }

    const token_row = await load_valid_reset_token(raw_token);
    if (!token_row) {
        return res.status(400).render('layout', {
            title: 'Reset Password',
            showTopNav: false,
            activeNav: '',
            user: null,
            contentView: null,
            contentData: {
                heading: 'Invalid or expired link',
                message: 'Please request a new password reset link.'
            }
        });
    }

    return renderLayout(res, {
        title: 'Reset Password',
        showTopNav: false,
        contentView: 'reset',
        contentData: {
            token: raw_token,
            error: null
        }
    });
});

router.post('/reset/:token', async (req, res) => {
    const raw_token = String((req.params && req.params.token) ? req.params.token : '').trim();
    const password_1 = String((req.body && req.body.password) ? req.body.password : '');
    const password_2 = String((req.body && req.body.password2) ? req.body.password2 : '');

    if (!/^[a-f0-9]{64}$/i.test(raw_token)) {
        return res.status(400).render('layout', {
            title: 'Reset Password',
            showTopNav: false,
            activeNav: '',
            user: null,
            contentView: null,
            contentData: {
                heading: 'Invalid or expired link',
                message: 'Please request a new password reset link.'
            }
        });
    }

    if (password_1.length < config.auth.minPasswordLength || password_1 !== password_2) {
        return renderLayout(res, {
            title: 'Reset Password',
            showTopNav: false,
            contentView: 'reset',
            contentData: {
                token: raw_token,
                error: `Passwords must match and be at least ${config.auth.minPasswordLength} characters.`
            }
        });
    }

    const token_hash = sha256_hex(raw_token);
    const pool = getPool();
    let connection = null;

    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [rows] = await connection.query(
            'SELECT id, user_id, used_at, expires_at FROM password_reset_tokens WHERE token_hash = ? LIMIT 1 FOR UPDATE',
            [token_hash]
        );

        if (!rows || rows.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(400).render('layout', {
                title: 'Reset Password',
                showTopNav: false,
                activeNav: '',
                user: null,
                contentView: null,
                contentData: {
                    heading: 'Invalid or expired link',
                    message: 'Please request a new password reset link.'
                }
            });
        }

        const token_row = rows[0];
        if (token_row.used_at !== null || (new Date(token_row.expires_at)).getTime() <= Date.now()) {
            await connection.rollback();
            connection.release();
            return res.status(400).render('layout', {
                title: 'Reset Password',
                showTopNav: false,
                activeNav: '',
                user: null,
                contentView: null,
                contentData: {
                    heading: 'Invalid or expired link',
                    message: 'Please request a new password reset link.'
                }
            });
        }

        const new_password_hash = await hash_password(password_1);
        await connection.query(
            'UPDATE users SET password_hash = ?, force_pw_change = 0 WHERE id = ? LIMIT 1',
            [new_password_hash, token_row.user_id]
        );

        await connection.query(
            'UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL',
            [token_row.user_id]
        );

        await connection.commit();
        connection.release();

        return res.redirect('/login?reset=1');
    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (_) {
                // ignore
            }
            connection.release();
        }

        console.error('[AUTH] reset password failed', error);
        return renderLayout(res, {
            title: 'Reset Password',
            showTopNav: false,
            contentView: 'reset',
            contentData: {
                token: raw_token,
                error: 'Server error while resetting password.'
            }
        });
    }
});

module.exports = router;
