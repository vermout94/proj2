'use strict';

const express = require('express');
const {
    ROLE_SUPER_ADMIN,
    ROLE_ADMIN,
    require_admin_or_super
} = require('../auth/middleware');
const { hash_password } = require('../auth/password');
const { generate_token_hex, sha256_hex } = require('../utils/tokens');
const { send_text_mail } = require('../utils/mailer');
const { parse_positive_int, sanitize_username, sanitize_email } = require('../utils/validators');
const { log_admin_action } = require('../utils/audit_logger');
const config = require('../config');
const { renderLayout } = require('./layout_render');
const user_management = require('../models/user_management');

const router = express.Router();

function parse_user_id(raw_value) {
    return parse_positive_int(raw_value);
}

function redirect_with_message(res, code) {
    return res.redirect(`/admin/users?msg=${encodeURIComponent(code)}`);
}

function is_super_admin(req) {
    return !!(req.session && req.session.user && req.session.user.role === ROLE_SUPER_ADMIN);
}

function is_admin(req) {
    return !!(req.session && req.session.user && req.session.user.role === ROLE_ADMIN);
}

function audit(req, action, outcome, target, details) {
    log_admin_action(req, action, outcome, target, details);
}

function grouped_access_by_user(access_rows) {
    const grouped = {};

    for (const row of access_rows) {
        const key = String(row.user_id);
        if (!grouped[key]) {
            grouped[key] = [];
        }
        grouped[key].push(row);
    }

    return grouped;
}

function build_reset_link(req, raw_token) {
    const configured_base_url = String(config.auth.baseUrl || '').trim();
    if (configured_base_url.length > 0) {
        return `${configured_base_url.replace(/\/+$/, '')}/reset/${raw_token}`;
    }

    const proto = String(req.protocol || 'http');
    const host = String(req.get('host') || '');
    return `${proto}://${host}/reset/${raw_token}`;
}

async function issue_invite_token_and_email(req, user_record) {
    const raw_token = generate_token_hex(32);
    const token_hash = sha256_hex(raw_token);
    const expires_at = new Date(Date.now() + (config.auth.inviteTtlMinutes * 60 * 1000));

    await user_management.replace_open_reset_tokens(user_record.id, token_hash, expires_at);
    await user_management.update_force_password_change(user_record.id, true);

    const setup_link = build_reset_link(req, raw_token);
    if (config.auth.logResetLinks === true) {
        console.log(`[INVITE] setup link for ${user_record.email}: ${setup_link}`);
    }

    const message_text =
        `Hello ${user_record.username},\n\n` +
        `Your Drone Management account was created.\n` +
        `Role: ${user_record.role}\n\n` +
        `Set your password here:\n${setup_link}\n\n` +
        `This link expires in ${config.auth.inviteTtlMinutes} minutes.\n`;

    const mail_result = await send_text_mail(
        user_record.email,
        'Drone Management account invite',
        message_text
    );

    return {
        ok: mail_result.ok === true,
        error: mail_result.error || null
    };
}

async function render_users_admin_page(req, res, msg_code) {
    const users = await user_management.list_users_with_core_fields();
    const drones = await user_management.list_drones_for_assignment();
    const access_rows = await user_management.list_drone_access_for_all_users();

    return renderLayout(res, {
        title: 'User Management',
        showTopNav: true,
        activeNav: 'users',
        user: req.session.user,
        contentView: 'admin_users',
        contentData: {
            msg: String(msg_code || ''),
            viewer_role: req.session.user.role,
            viewer_user_id: req.session.user.id,
            min_password_length: config.auth.minPasswordLength,
            users,
            drones,
            access_by_user: grouped_access_by_user(access_rows)
        }
    });
}

function may_admin_modify_target(req, target_user) {
    if (!target_user) {
        return false;
    }

    if (Number(target_user.is_protected) === 1) {
        return false;
    }

    if (is_super_admin(req)) {
        return true;
    }

    if (!is_admin(req)) {
        return false;
    }

    return String(target_user.role) === 'user';
}

function may_manage_drone_access_for_target(req, target_user) {
    if (!target_user) {
        return false;
    }

    if (Number(target_user.is_protected) === 1) {
        return false;
    }

    const target_role = String(target_user.role || '');
    if (target_role === 'super_admin') {
        return false;
    }

    if (is_super_admin(req)) {
        return (target_role === 'admin' || target_role === 'user');
    }

    if (is_admin(req)) {
        return target_role === ROLE_ADMIN || target_role === 'user';
    }

    return false;
}

router.get('/admin/users', require_admin_or_super, async (req, res) => {
    try {
        return render_users_admin_page(req, res, req.query.msg);
    } catch (error) {
        console.error('[ADMIN_USERS] render failed', error);
        return res.status(500).send('Server error');
    }
});

router.post('/admin/users/create', require_admin_or_super, async (req, res) => {
    if (!is_super_admin(req)) {
        audit(req, 'user_create', 'denied', null, { reason: 'not_super_admin' });
        return res.status(403).send('Forbidden');
    }

    const username = sanitize_username(req.body.username);
    const email = sanitize_email(req.body.email);
    const role = (String(req.body.role || '') === 'admin') ? 'admin' : 'user';

    if (!username || !email) {
        audit(req, 'user_create', 'rejected', null, { reason: 'invalid_input' });
        return redirect_with_message(res, 'create_invalid');
    }

    try {
        const temp_secret = generate_token_hex(32);
        const password_hash = await hash_password(temp_secret);
        const new_user_id = await user_management.create_user_with_profile({
            username,
            email,
            password_hash,
            role,
            force_pw_change: true
        });

        const invite_result = await issue_invite_token_and_email(req, {
            id: new_user_id,
            username,
            email,
            role
        });

        if (invite_result.ok) {
            audit(req, 'user_create', 'success', { user_id: new_user_id, email, role }, { invite_sent: true });
            return redirect_with_message(res, 'created_invite_sent');
        }

        audit(req, 'user_create', 'partial', { user_id: new_user_id, email, role }, { invite_sent: false, invite_error: invite_result.error });
        return redirect_with_message(res, 'created_invite_not_sent');
    } catch (error) {
        if (error && error.code === 'ER_DUP_ENTRY') {
            audit(req, 'user_create', 'rejected', null, { reason: 'duplicate' });
            return redirect_with_message(res, 'duplicate');
        }
        console.error('[ADMIN_USERS] create failed', error);
        audit(req, 'user_create', 'error', null, { error: error.message });
        return redirect_with_message(res, 'server_error');
    }
});

router.post('/admin/users/:id/resend-invite', require_admin_or_super, async (req, res) => {
    if (!is_super_admin(req)) {
        audit(req, 'user_resend_invite', 'denied', { user_id: target_id }, { reason: 'not_super_admin' });
        return res.status(403).send('Forbidden');
    }

    const target_id = parse_user_id(req.params.id);
    if (target_id === req.session.user.id) {
        return redirect_with_message(res, 'self_blocked');
    }

    try {
        const target_user = await user_management.find_user_by_id(target_id);
        if (!target_user) {
            return redirect_with_message(res, 'not_found');
        }

        if (String(target_user.role) === 'super_admin' || Number(target_user.is_protected) === 1) {
            return redirect_with_message(res, 'protected');
        }

        if (String(target_user.status) !== 'active') {
            return redirect_with_message(res, 'invite_target_inactive');
        }

        const invite_result = await issue_invite_token_and_email(req, target_user);
        if (invite_result.ok) {
            audit(req, 'user_resend_invite', 'success', { user_id: target_id, email: target_user.email }, { invite_sent: true });
            return redirect_with_message(res, 'invite_resent');
        }

        audit(req, 'user_resend_invite', 'partial', { user_id: target_id, email: target_user.email }, { invite_sent: false, invite_error: invite_result.error });
        return redirect_with_message(res, 'invite_resend_not_sent');
    } catch (error) {
        console.error('[ADMIN_USERS] resend invite failed', error);
        audit(req, 'user_resend_invite', 'error', { user_id: target_id }, { error: error.message });
        return redirect_with_message(res, 'server_error');
    }
});

router.post('/admin/users/:id/role', require_admin_or_super, async (req, res) => {
    if (!is_super_admin(req)) {
        audit(req, 'user_role_update', 'denied', { user_id: parse_user_id(req.params.id) }, { reason: 'not_super_admin' });
        return res.status(403).send('Forbidden');
    }

    const target_id = parse_user_id(req.params.id);
    const role = (String(req.body.role || '') === 'admin') ? 'admin' : 'user';

    if (target_id === req.session.user.id) {
        return redirect_with_message(res, 'self_blocked');
    }

    try {
        const target_user = await user_management.find_user_by_id(target_id);
        if (!target_user) {
            return redirect_with_message(res, 'not_found');
        }

        if (String(target_user.role) === 'super_admin' || Number(target_user.is_protected) === 1) {
            return redirect_with_message(res, 'protected');
        }

        await user_management.update_user_role(target_id, role);
        audit(req, 'user_role_update', 'success', { user_id: target_id }, { role });
        return redirect_with_message(res, 'role_updated');
    } catch (error) {
        console.error('[ADMIN_USERS] role update failed', error);
        audit(req, 'user_role_update', 'error', { user_id: target_id }, { error: error.message });
        return redirect_with_message(res, 'server_error');
    }
});

router.post('/admin/users/:id/status', require_admin_or_super, async (req, res) => {
    const target_id = parse_user_id(req.params.id);
    const status = (String(req.body.status || '') === 'suspended') ? 'suspended' : 'active';

    if (target_id === req.session.user.id) {
        return redirect_with_message(res, 'self_blocked');
    }

    try {
        const target_user = await user_management.find_user_by_id(target_id);
        if (!target_user) {
            return redirect_with_message(res, 'not_found');
        }

        if (!may_admin_modify_target(req, target_user)) {
            return redirect_with_message(res, 'forbidden_target');
        }

        if (String(target_user.role) === 'super_admin') {
            return redirect_with_message(res, 'protected');
        }

        await user_management.update_user_status(target_id, status);
        audit(req, 'user_status_update', 'success', { user_id: target_id }, { status });
        return redirect_with_message(res, 'status_updated');
    } catch (error) {
        console.error('[ADMIN_USERS] status update failed', error);
        audit(req, 'user_status_update', 'error', { user_id: target_id }, { error: error.message });
        return redirect_with_message(res, 'server_error');
    }
});

router.post('/admin/users/:id/password', require_admin_or_super, async (req, res) => {
    if (!is_super_admin(req)) {
        audit(req, 'user_password_set', 'denied', { user_id: parse_user_id(req.params.id) }, { reason: 'not_super_admin' });
        return res.status(403).send('Forbidden');
    }

    const target_id = parse_user_id(req.params.id);
    const new_password = String(req.body.password || '');

    if (new_password.length < config.auth.minPasswordLength) {
        return redirect_with_message(res, 'password_invalid');
    }

    try {
        const target_user = await user_management.find_user_by_id(target_id);
        if (!target_user) {
            return redirect_with_message(res, 'not_found');
        }

        if (String(target_user.role) === 'super_admin' || Number(target_user.is_protected) === 1) {
            return redirect_with_message(res, 'protected');
        }

        const password_hash = await hash_password(new_password);
        await user_management.update_user_password(target_id, password_hash);
        audit(req, 'user_password_set', 'success', { user_id: target_id }, {});
        return redirect_with_message(res, 'password_updated');
    } catch (error) {
        console.error('[ADMIN_USERS] password update failed', error);
        audit(req, 'user_password_set', 'error', { user_id: target_id }, { error: error.message });
        return redirect_with_message(res, 'server_error');
    }
});

router.post('/admin/users/:id/delete', require_admin_or_super, async (req, res) => {
    if (!is_super_admin(req)) {
        audit(req, 'user_delete', 'denied', { user_id: parse_user_id(req.params.id) }, { reason: 'not_super_admin' });
        return res.status(403).send('Forbidden');
    }

    const target_id = parse_user_id(req.params.id);

    if (target_id === req.session.user.id) {
        return redirect_with_message(res, 'self_blocked');
    }

    try {
        const target_user = await user_management.find_user_by_id(target_id);
        if (!target_user) {
            return redirect_with_message(res, 'not_found');
        }

        if (String(target_user.role) === 'super_admin' || Number(target_user.is_protected) === 1) {
            return redirect_with_message(res, 'protected');
        }

        await user_management.delete_user_by_id(target_id);
        audit(req, 'user_delete', 'success', { user_id: target_id }, {});
        return redirect_with_message(res, 'deleted');
    } catch (error) {
        console.error('[ADMIN_USERS] delete failed', error);
        audit(req, 'user_delete', 'error', { user_id: target_id }, { error: error.message });
        return redirect_with_message(res, 'server_error');
    }
});

router.post('/admin/users/:id/drone-access', require_admin_or_super, async (req, res) => {
    const target_id = parse_user_id(req.params.id);
    const drone_id = String(req.body.drone_id || '').trim();
    const access_level = (String(req.body.access_level || '') === 'full') ? 'full' : 'read';

    if (!drone_id) {
        return redirect_with_message(res, 'missing_drone');
    }

    try {
        const target_user = await user_management.find_user_by_id(target_id);
        if (!target_user) {
            return redirect_with_message(res, 'not_found');
        }

        if (!may_manage_drone_access_for_target(req, target_user)) {
            return redirect_with_message(res, 'forbidden_target');
        }

        const exists = await user_management.drone_exists(drone_id);
        if (!exists) {
            return redirect_with_message(res, 'drone_not_found');
        }

        await user_management.upsert_drone_access({
            user_id: target_id,
            drone_id,
            access_level,
            granted_by: req.session.user.id
        });
        audit(req, 'drone_access_upsert', 'success', { user_id: target_id, drone_id }, { access_level });
        return redirect_with_message(res, 'drone_access_updated');
    } catch (error) {
        console.error('[ADMIN_USERS] drone access add failed', error);
        audit(req, 'drone_access_upsert', 'error', { user_id: target_id, drone_id }, { error: error.message });
        return redirect_with_message(res, 'server_error');
    }
});

router.post('/admin/users/:id/drone-access/remove', require_admin_or_super, async (req, res) => {
    const target_id = parse_user_id(req.params.id);
    const drone_id = String(req.body.drone_id || '').trim();

    if (!drone_id) {
        return redirect_with_message(res, 'missing_drone');
    }

    try {
        const target_user = await user_management.find_user_by_id(target_id);
        if (!target_user) {
            return redirect_with_message(res, 'not_found');
        }

        if (!may_manage_drone_access_for_target(req, target_user)) {
            return redirect_with_message(res, 'forbidden_target');
        }

        await user_management.remove_drone_access({
            user_id: target_id,
            drone_id
        });
        audit(req, 'drone_access_remove', 'success', { user_id: target_id, drone_id }, {});
        return redirect_with_message(res, 'drone_access_removed');
    } catch (error) {
        console.error('[ADMIN_USERS] drone access remove failed', error);
        audit(req, 'drone_access_remove', 'error', { user_id: target_id, drone_id }, { error: error.message });
        return redirect_with_message(res, 'server_error');
    }
});

module.exports = router;
