'use strict';

function log_admin_action(req, action, outcome, target, details) {
    const actor = (req && req.session && req.session.user) ? req.session.user : null;

    const payload = {
        timestamp: new Date().toISOString(),
        action: String(action || ''),
        outcome: String(outcome || ''),
        actor_user_id: actor ? actor.id : null,
        actor_role: actor ? actor.role : null,
        actor_username: actor ? actor.username : null,
        target: target || {},
        details: details || {},
        ip: req && req.ip ? req.ip : null
    };

    console.log(`[AUDIT] ${JSON.stringify(payload)}`);
}

module.exports = {
    log_admin_action
};
