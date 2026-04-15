'use strict';

const express = require('express');
const { require_admin_or_super } = require('../auth/middleware');
const { generate_token_hex } = require('../utils/tokens');
const { sanitize_drone_id, parse_display_name } = require('../utils/validators');
const { log_admin_action } = require('../utils/audit_logger');
const { renderLayout } = require('./layout_render');
const drone_management = require('../models/drone_management');

const router = express.Router();

function audit(req, action, outcome, target, details) {
    log_admin_action(req, action, outcome, target, details);
}

function redirect_with_message(res, code) {
    return res.redirect(`/admin/drones?msg=${encodeURIComponent(code)}`);
}

function pop_flash_token(req, key) {
    if (!req.session || !req.session[key]) {
        return null;
    }
    const payload = req.session[key];
    delete req.session[key];
    return payload;
}

async function render_drones_admin_page(req, res, msg_code) {
    const drones = await drone_management.list_drones_for_admin();
    const created_token = pop_flash_token(req, '_admin_created_drone_token');
    const rotated_token = pop_flash_token(req, '_admin_rotated_drone_token');

    return renderLayout(res, {
        title: 'Drone Management',
        showTopNav: true,
        activeNav: 'drones',
        user: req.session.user,
        contentView: 'admin_drones',
        contentData: {
            msg: String(msg_code || ''),
            drones,
            created_token,
            rotated_token
        }
    });
}

router.get('/admin/drones', require_admin_or_super, async (req, res) => {
    try {
        return render_drones_admin_page(req, res, req.query.msg);
    } catch (error) {
        console.error('[ADMIN_DRONES] render failed', error);
        return res.status(500).send('Server error');
    }
});

router.post('/admin/drones/create', require_admin_or_super, async (req, res) => {
    const drone_id = sanitize_drone_id(req.body.drone_id);
    const display_name_parsed = parse_display_name(req.body.display_name);

    if (!drone_id) {
        return redirect_with_message(res, 'bad_id');
    }
    if (!display_name_parsed.ok) {
        return redirect_with_message(res, 'bad_name');
    }

    try {
        const drone_token = generate_token_hex(32);
        await drone_management.create_drone_with_defaults({
            drone_id,
            drone_token,
            display_name: display_name_parsed.value,
            created_by: req.session.user.id
        });

        if (req.session) {
            req.session._admin_created_drone_token = {
                drone_id,
                drone_token
            };
        }
        audit(req, 'drone_create', 'success', { drone_id: drone_id }, {});
        return redirect_with_message(res, 'created');
    } catch (error) {
        if (error && error.code === 'ER_DUP_ENTRY') {
            audit(req, 'drone_create', 'rejected', { drone_id: drone_id }, { reason: 'duplicate' });
            return redirect_with_message(res, 'exists');
        }
        console.error('[ADMIN_DRONES] create failed', error);
        audit(req, 'drone_create', 'error', { drone_id: drone_id }, { error: error.message });
        return redirect_with_message(res, 'server_error');
    }
});

router.post('/admin/drones/:drone_id/rename', require_admin_or_super, async (req, res) => {
    const drone_id = sanitize_drone_id(req.params.drone_id);
    const display_name_parsed = parse_display_name(req.body.display_name);

    if (!drone_id) {
        return redirect_with_message(res, 'bad_id');
    }
    if (!display_name_parsed.ok) {
        return redirect_with_message(res, 'bad_name');
    }

    try {
        const affected = await drone_management.update_drone_name(drone_id, display_name_parsed.value);
        if (affected === 0) {
            return redirect_with_message(res, 'not_found');
        }
        audit(req, 'drone_rename', 'success', { drone_id: drone_id }, { display_name: display_name_parsed.value });
        return redirect_with_message(res, 'renamed');
    } catch (error) {
        console.error('[ADMIN_DRONES] rename failed', error);
        audit(req, 'drone_rename', 'error', { drone_id: drone_id }, { error: error.message });
        return redirect_with_message(res, 'server_error');
    }
});

router.post('/admin/drones/:drone_id/active', require_admin_or_super, async (req, res) => {
    const drone_id = sanitize_drone_id(req.params.drone_id);
    const is_active = String(req.body.is_active || '') === '1';

    if (!drone_id) {
        return redirect_with_message(res, 'bad_id');
    }

    try {
        const affected = await drone_management.update_drone_active(drone_id, is_active);
        if (affected === 0) {
            return redirect_with_message(res, 'not_found');
        }
        audit(req, 'drone_active_update', 'success', { drone_id: drone_id }, { is_active: is_active });
        return redirect_with_message(res, is_active ? 'activated' : 'deactivated');
    } catch (error) {
        console.error('[ADMIN_DRONES] active toggle failed', error);
        audit(req, 'drone_active_update', 'error', { drone_id: drone_id }, { error: error.message });
        return redirect_with_message(res, 'server_error');
    }
});

router.post('/admin/drones/:drone_id/lock', require_admin_or_super, async (req, res) => {
    const drone_id = sanitize_drone_id(req.params.drone_id);
    const is_locked = String(req.body.is_locked || '') === '1';

    if (!drone_id) {
        return redirect_with_message(res, 'bad_id');
    }

    try {
        const affected = await drone_management.update_drone_lock(drone_id, is_locked);
        if (affected === 0) {
            return redirect_with_message(res, 'not_found');
        }
        audit(req, 'drone_lock_update', 'success', { drone_id: drone_id }, { is_locked: is_locked });
        return redirect_with_message(res, is_locked ? 'locked' : 'unlocked');
    } catch (error) {
        console.error('[ADMIN_DRONES] lock toggle failed', error);
        audit(req, 'drone_lock_update', 'error', { drone_id: drone_id }, { error: error.message });
        return redirect_with_message(res, 'server_error');
    }
});

router.post('/admin/drones/:drone_id/rotate-token', require_admin_or_super, async (req, res) => {
    const drone_id = sanitize_drone_id(req.params.drone_id);

    if (!drone_id) {
        return redirect_with_message(res, 'bad_id');
    }

    try {
        const drone = await drone_management.find_drone_by_id(drone_id);
        if (!drone) {
            return redirect_with_message(res, 'not_found');
        }

        if (Number(drone.is_connected) === 1) {
            return redirect_with_message(res, 'connected');
        }

        const new_token = generate_token_hex(32);
        await drone_management.rotate_drone_token(drone_id, new_token);

        if (req.session) {
            req.session._admin_rotated_drone_token = {
                drone_id,
                drone_token: new_token
            };
        }
        audit(req, 'drone_token_rotate', 'success', { drone_id: drone_id }, {});
        return redirect_with_message(res, 'token_rotated');
    } catch (error) {
        console.error('[ADMIN_DRONES] rotate token failed', error);
        audit(req, 'drone_token_rotate', 'error', { drone_id: drone_id }, { error: error.message });
        return redirect_with_message(res, 'server_error');
    }
});

router.post('/admin/drones/:drone_id/delete', require_admin_or_super, async (req, res) => {
    const drone_id = sanitize_drone_id(req.params.drone_id);

    if (!drone_id) {
        return redirect_with_message(res, 'bad_id');
    }

    try {
        const drone = await drone_management.find_drone_by_id(drone_id);
        if (!drone) {
            return redirect_with_message(res, 'not_found');
        }

        if (Number(drone.is_connected) === 1) {
            return redirect_with_message(res, 'connected');
        }

        const affected = await drone_management.delete_drone_cascade(drone_id);
        if (affected === 0) {
            return redirect_with_message(res, 'not_found');
        }
        audit(req, 'drone_delete', 'success', { drone_id: drone_id }, {});
        return redirect_with_message(res, 'deleted');
    } catch (error) {
        console.error('[ADMIN_DRONES] delete failed', error);
        audit(req, 'drone_delete', 'error', { drone_id: drone_id }, { error: error.message });
        return redirect_with_message(res, 'server_error');
    }
});

module.exports = router;
