'use strict';

const express = require('express');
const { require_auth } = require('../auth/middleware');
const { renderLayout } = require('./layout_render');
const user_drone_access = require('../models/user_drone_access');

const router = express.Router();

function sanitize_drone_id(raw_value) {
    const drone_id = String(raw_value || '').trim();
    if (!/^[A-Za-z0-9_-]{3,32}$/.test(drone_id)) {
        return null;
    }
    return drone_id;
}

function detail_redirect_with_message(res, drone_id, msg_code) {
    return res.redirect(`/my-drones/${encodeURIComponent(drone_id)}?msg=${encodeURIComponent(msg_code)}`);
}

router.get('/my-drones', require_auth, async (req, res) => {
    try {
        const drones = await user_drone_access.list_visible_drones_for_user(req.session.user);
        return renderLayout(res, {
            title: 'My Drones',
            showTopNav: true,
            activeNav: 'my_drones',
            user: req.session.user,
            contentView: 'my_drones',
            contentData: {
                role: req.session.user.role,
                drones
            }
        });
    } catch (error) {
        console.error('[USER_DRONES] list failed', error);
        return res.status(500).send('Server error');
    }
});

router.get('/my-drones/:drone_id', require_auth, async (req, res) => {
    const drone_id = sanitize_drone_id(req.params.drone_id);
    const msg_code = String(req.query.msg || '');

    if (!drone_id) {
        return res.status(404).render('layout', {
            title: 'Drone Not Found',
            showTopNav: true,
            activeNav: 'my_drones',
            user: req.session.user,
            contentView: null,
            contentData: {
                heading: 'Drone Not Found',
                message: 'The requested drone does not exist.'
            }
        });
    }

    try {
        const drone = await user_drone_access.find_visible_drone_for_user(req.session.user, drone_id);
        if (!drone) {
            return res.status(404).render('layout', {
                title: 'Drone Not Found',
                showTopNav: true,
                activeNav: 'my_drones',
                user: req.session.user,
                contentView: null,
                contentData: {
                    heading: 'Drone Not Found',
                    message: 'No accessible drone found for this identifier.'
                }
            });
        }

        const parameters = await user_drone_access.load_drone_control_parameters(drone_id);
        const summary = await user_drone_access.load_drone_usage_summary(drone_id);
        const access_level = String(drone.access_level || 'read');
        const can_full_control = access_level === 'full';

        return renderLayout(res, {
            title: `Drone ${drone_id}`,
            showTopNav: true,
            activeNav: 'my_drones',
            user: req.session.user,
            contentView: 'my_drone_detail',
            contentData: {
                msg: msg_code,
                drone,
                parameters,
                summary,
                access_level,
                can_full_control
            }
        });
    } catch (error) {
        console.error('[USER_DRONES] detail failed', error);
        return res.status(500).send('Server error');
    }
});

router.post('/my-drones/:drone_id/actions/:action', require_auth, async (req, res) => {
    const drone_id = sanitize_drone_id(req.params.drone_id);
    const action = String(req.params.action || '').trim().toLowerCase();
    const allowed_actions = ['reboot', 'reconnect', 'tune', 'step_response'];

    if (!drone_id || !allowed_actions.includes(action)) {
        return res.status(404).send('Not found');
    }

    try {
        const drone = await user_drone_access.find_visible_drone_for_user(req.session.user, drone_id);
        if (!drone) {
            return res.status(404).send('Not found');
        }

        const access_level = String(drone.access_level || 'read');
        if (access_level !== 'full') {
            return detail_redirect_with_message(res, drone_id, 'full_access_required');
        }

        if (Number(drone.is_active) !== 1) {
            return detail_redirect_with_message(res, drone_id, 'drone_inactive');
        }

        if ((action === 'tune' || action === 'step_response') && Number(drone.is_locked) === 1) {
            return detail_redirect_with_message(res, drone_id, 'drone_locked');
        }

        return detail_redirect_with_message(res, drone_id, 'action_placeholder');
    } catch (error) {
        console.error('[USER_DRONES] action failed', error);
        return detail_redirect_with_message(res, drone_id, 'server_error');
    }
});

module.exports = router;
