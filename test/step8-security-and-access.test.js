'use strict';

const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const session = require('express-session');
const request = require('supertest');

const { FakePool } = require('./support/fake_pool');

const project_root = path.resolve(__dirname, '..');

function set_test_env() {
    process.env.NODE_ENV = 'test';
    process.env.HOST = '127.0.0.1';
    process.env.PORT = '3100';
    process.env.DB_HOST = '127.0.0.1';
    process.env.DB_PORT = '3306';
    process.env.DB_NAME = 'drone_db';
    process.env.DB_USER = 'test';
    process.env.DB_PASS = 'test';
    process.env.DB_CONNECTION_LIMIT = '5';
    process.env.SESSION_SECRET = '0123456789abcdef0123456789abcdef';
    process.env.SESSION_COOKIE_NAME = 'test.sid';
    process.env.SESSION_MAX_AGE_MS = '3600000';
    process.env.SESSION_COOKIE_SECURE = 'false';
    process.env.PASSWORD_PEPPER = 'abcdef0123456789abcdef0123456789';
    process.env.MIN_PASSWORD_LENGTH = '8';
    process.env.PASSWORD_RESET_TTL_MINUTES = '60';
    process.env.INVITE_TTL_MINUTES = '1440';
    process.env.APP_BASE_URL = 'http://localhost:3100';
    process.env.LOG_PASSWORD_RESET_LINKS = 'false';
    process.env.SMTP_HOST = '';
    process.env.SMTP_USER = '';
    process.env.SMTP_PASS = '';
    process.env.SMTP_PORT = '465';
    process.env.SMTP_SECURE = 'true';
    process.env.SMTP_FROM = 'Drone Management <test@example.test>';
    process.env.SMTP_TLS_REJECT_UNAUTHORIZED = 'true';
    process.env.LOGIN_RATE_LIMIT_WINDOW_MS = '600000';
    process.env.LOGIN_RATE_LIMIT_MAX = '10';
    process.env.FORGOT_RATE_LIMIT_WINDOW_MS = '3600000';
    process.env.FORGOT_RATE_LIMIT_MAX = '8';
}

function clear_src_require_cache() {
    const src_root = path.join(project_root, 'src');
    for (const cache_key of Object.keys(require.cache)) {
        if (cache_key.startsWith(src_root)) {
            delete require.cache[cache_key];
        }
    }
}

function mock_module(rel_path, exports_obj) {
    const abs_path = path.join(project_root, rel_path);
    const resolved = require.resolve(abs_path);
    require.cache[resolved] = {
        id: resolved,
        filename: resolved,
        loaded: true,
        exports: exports_obj
    };
}

function extract_csrf(html_text) {
    const match = String(html_text || '').match(/name="_csrf"\s+value="([^"]+)"/);
    assert.ok(match, 'csrf token not found in HTML');
    return match[1];
}

async function build_password_hash(plain_password) {
    set_test_env();
    clear_src_require_cache();
    const password = require(path.join(project_root, 'src', 'auth', 'password.js'));
    return password.hash_password(plain_password);
}

function create_test_app(options) {
    set_test_env();
    clear_src_require_cache();

    mock_module(path.join('src', 'db', 'pool.js'), {
        getPool: () => options.pool,
        closePool: async () => {}
    });

    if (options.mailer_mock) {
        mock_module(path.join('src', 'utils', 'mailer.js'), options.mailer_mock);
    }

    const csrf = require(path.join(project_root, 'src', 'security', 'csrf.js'));
    const app = express();

    app.use(express.urlencoded({ extended: false }));
    app.use(express.json());
    app.use(session({
        secret: '0123456789abcdef0123456789abcdef',
        resave: false,
        saveUninitialized: false
    }));
    app.use(csrf.attach_csrf_token);
    app.use(csrf.csrf_protect);
    app.use((req, res, next) => {
        res.locals.user = req.session.user || null;
        res.locals.isAdmin = !!(res.locals.user && (res.locals.user.role === 'admin' || res.locals.user.role === 'super_admin'));
        res.locals.isSuperAdmin = !!(res.locals.user && res.locals.user.role === 'super_admin');
        res.locals.csrfToken = req.csrf_token || '';
        next();
    });

    app.set('view engine', 'ejs');
    app.set('views', path.join(project_root, 'src', 'views'));

    app.get('/__as/:id', (req, res) => {
        const user_id = Number(req.params.id);
        const user = options.pool.state.users.find((u) => Number(u.id) === user_id);
        if (!user) {
            res.status(404).send('user_not_found');
            return;
        }
        req.session.user = {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role
        };
        res.status(204).end();
    });

    options.mount(app);
    return app;
}

test('auth login/logout/reset flow and CSRF enforcement', async () => {
    const original_password = 'TopSecret123';
    const new_password = 'NewSecret123';
    const password_hash = await build_password_hash(original_password);

    const pool = new FakePool({
        users: [{
            id: 1,
            username: 'alice',
            email: 'alice@example.test',
            password_hash: password_hash,
            role: 'user',
            status: 'active',
            is_protected: 0,
            force_pw_change: 0
        }]
    });

    const sent_emails = [];
    const app = create_test_app({
        pool: pool,
        mailer_mock: {
            smtp_enabled: () => true,
            send_text_mail: async (to, subject, text) => {
                sent_emails.push({ to, subject, text });
                return { ok: true };
            }
        },
        mount: (instance) => {
            const auth_router = require(path.join(project_root, 'src', 'routes', 'auth.js'));
            instance.use('/', auth_router);
            instance.get('/dashboard', (req, res) => res.status(200).send('dashboard'));
        }
    });

    const agent = request.agent(app);

    const login_page = await agent.get('/login').expect(200);
    const login_csrf = extract_csrf(login_page.text);

    await agent
        .post('/login')
        .type('form')
        .send({ email: 'alice@example.test', password: original_password })
        .expect(403);

    await agent
        .post('/login')
        .type('form')
        .send({ _csrf: login_csrf, email: 'alice@example.test', password: original_password })
        .expect(302)
        .expect('Location', '/dashboard');

    const after_login_forgot_page = await agent.get('/forgot').expect(200);
    const logout_csrf = extract_csrf(after_login_forgot_page.text);

    await agent
        .post('/logout')
        .type('form')
        .send({ _csrf: logout_csrf })
        .expect(302)
        .expect('Location', '/login');

    const forgot_page = await agent.get('/forgot').expect(200);
    const forgot_csrf = extract_csrf(forgot_page.text);

    await agent
        .post('/forgot')
        .type('form')
        .send({ _csrf: forgot_csrf, email: 'alice@example.test' })
        .expect(302)
        .expect('Location', '/forgot?sent=1');

    assert.equal(sent_emails.length, 1, 'forgot flow should send one email');
    const reset_token_match = sent_emails[0].text.match(/\/reset\/([a-f0-9]{64})/i);
    assert.ok(reset_token_match, 'reset token link should be present in email body');
    const reset_token = reset_token_match[1];

    const reset_page = await agent.get(`/reset/${reset_token}`).expect(200);
    const reset_csrf = extract_csrf(reset_page.text);

    await agent
        .post(`/reset/${reset_token}`)
        .type('form')
        .send({ _csrf: reset_csrf, password: new_password, password2: new_password })
        .expect(302)
        .expect('Location', '/login?reset=1');

    const login_page_2 = await agent.get('/login').expect(200);
    const login_csrf_2 = extract_csrf(login_page_2.text);

    await agent
        .post('/login')
        .type('form')
        .send({ _csrf: login_csrf_2, email: 'alice@example.test', password: original_password })
        .expect(302)
        .expect('Location', '/login?err=1');

    await agent
        .post('/login')
        .type('form')
        .send({ _csrf: login_csrf_2, email: 'alice@example.test', password: new_password })
        .expect(302)
        .expect('Location', '/dashboard');
});

test('RBAC middleware enforces admin and super-admin boundaries', async () => {
    const pool = new FakePool({
        users: [
            { id: 1, username: 'super', email: 'super@example.test', password_hash: 'x', role: 'super_admin', status: 'active', is_protected: 1 },
            { id: 2, username: 'admin', email: 'admin@example.test', password_hash: 'x', role: 'admin', status: 'active', is_protected: 0 },
            { id: 3, username: 'user', email: 'user@example.test', password_hash: 'x', role: 'user', status: 'active', is_protected: 0 }
        ]
    });

    const app = create_test_app({
        pool: pool,
        mount: (instance) => {
            const middleware = require(path.join(project_root, 'src', 'auth', 'middleware.js'));
            instance.get('/admin-zone', middleware.require_admin_or_super, (req, res) => res.status(200).send('ok'));
            instance.get('/super-zone', middleware.require_super_admin, (req, res) => res.status(200).send('ok'));
        }
    });

    const agent = request.agent(app);

    await agent.get('/__as/3').expect(204);
    await agent.get('/admin-zone').expect(403);

    await agent.get('/__as/2').expect(204);
    await agent.get('/admin-zone').expect(200);
    await agent.get('/super-zone').expect(403);

    await agent.get('/__as/1').expect(204);
    await agent.get('/super-zone').expect(200);
});

test('super-admin invite create and resend flows issue tokens and send emails', async () => {
    const super_password_hash = await build_password_hash('bootstrap-super-password');

    const pool = new FakePool({
        users: [{
            id: 1,
            username: 'super',
            email: 'super@example.test',
            password_hash: super_password_hash,
            role: 'super_admin',
            status: 'active',
            is_protected: 1
        }],
        drones: [{
            drone_id: 'DRONE_01',
            display_name: 'Main Drone',
            is_connected: 0,
            is_active: 1,
            is_locked: 0
        }]
    });

    const sent_emails = [];
    const app = create_test_app({
        pool: pool,
        mailer_mock: {
            smtp_enabled: () => true,
            send_text_mail: async (to, subject, text) => {
                sent_emails.push({ to, subject, text });
                return { ok: true };
            }
        },
        mount: (instance) => {
            const admin_users_router = require(path.join(project_root, 'src', 'routes', 'admin_users.js'));
            instance.use('/', admin_users_router);
        }
    });

    const agent = request.agent(app);
    await agent.get('/__as/1').expect(204);

    const page = await agent.get('/admin/users').expect(200);
    const csrf = extract_csrf(page.text);

    await agent
        .post('/admin/users/create')
        .type('form')
        .send({
            _csrf: csrf,
            username: 'bob',
            email: 'bob@example.test',
            role: 'admin'
        })
        .expect(302)
        .expect((res) => {
            assert.match(String(res.headers.location || ''), /created_invite_sent/);
        });

    const created_user = pool.state.users.find((u) => String(u.email) === 'bob@example.test');
    assert.ok(created_user, 'created user should exist');
    assert.equal(Number(created_user.force_pw_change), 1);
    assert.equal(pool.state.password_reset_tokens.length, 1);
    const first_token_hash = String(pool.state.password_reset_tokens[0].token_hash);

    const page_2 = await agent.get('/admin/users').expect(200);
    const csrf_2 = extract_csrf(page_2.text);

    await agent
        .post(`/admin/users/${created_user.id}/resend-invite`)
        .type('form')
        .send({ _csrf: csrf_2 })
        .expect(302)
        .expect((res) => {
            assert.match(String(res.headers.location || ''), /invite_resent/);
        });

    assert.equal(pool.state.password_reset_tokens.length, 1);
    assert.notEqual(String(pool.state.password_reset_tokens[0].token_hash), first_token_hash);
    assert.equal(sent_emails.length, 2);
});

test('admin can assign and remove drone access for admin accounts, including self, but not super-admin accounts', async () => {
    const pool = new FakePool({
        users: [
            { id: 1, username: 'super', email: 'super@example.test', password_hash: 'x', role: 'super_admin', status: 'active', is_protected: 1 },
            { id: 2, username: 'admin_actor', email: 'admin_actor@example.test', password_hash: 'x', role: 'admin', status: 'active', is_protected: 0 },
            { id: 3, username: 'admin_target', email: 'admin_target@example.test', password_hash: 'x', role: 'admin', status: 'active', is_protected: 0 }
        ],
        drones: [
            { drone_id: 'DRONE_01', display_name: 'Main Drone', is_connected: 1, is_active: 1, is_locked: 0 }
        ]
    });

    const app = create_test_app({
        pool: pool,
        mount: (instance) => {
            const admin_users_router = require(path.join(project_root, 'src', 'routes', 'admin_users.js'));
            instance.use('/', admin_users_router);
        }
    });

    const agent = request.agent(app);
    await agent.get('/__as/2').expect(204);

    const page = await agent.get('/admin/users').expect(200);
    assert.match(page.text, /\/admin\/users\/2\/drone-access/);
    assert.match(page.text, /\/admin\/users\/3\/drone-access/);
    const csrf = extract_csrf(page.text);

    await agent
        .post('/admin/users/2/drone-access')
        .type('form')
        .send({ _csrf: csrf, drone_id: 'DRONE_01', access_level: 'read' })
        .expect(302)
        .expect((res) => {
            assert.match(String(res.headers.location || ''), /drone_access_updated/);
        });

    const self_granted = pool.state.drone_user_access.find((row) => Number(row.user_id) === 2 && String(row.drone_id) === 'DRONE_01');
    assert.ok(self_granted, 'admin should be able to assign drone access to self');
    assert.equal(String(self_granted.access_level), 'read');
    assert.equal(Number(self_granted.granted_by), 2);

    const page_self_remove = await agent.get('/admin/users').expect(200);
    const csrf_self_remove = extract_csrf(page_self_remove.text);

    await agent
        .post('/admin/users/2/drone-access/remove')
        .type('form')
        .send({ _csrf: csrf_self_remove, drone_id: 'DRONE_01' })
        .expect(302)
        .expect((res) => {
            assert.match(String(res.headers.location || ''), /drone_access_removed/);
        });

    assert.ok(
        !pool.state.drone_user_access.find((row) => Number(row.user_id) === 2 && String(row.drone_id) === 'DRONE_01'),
        'self-assigned drone access should be removable'
    );

    const page_1 = await agent.get('/admin/users').expect(200);
    const csrf_1 = extract_csrf(page_1.text);

    await agent
        .post('/admin/users/3/drone-access')
        .type('form')
        .send({ _csrf: csrf_1, drone_id: 'DRONE_01', access_level: 'full' })
        .expect(302)
        .expect((res) => {
            assert.match(String(res.headers.location || ''), /drone_access_updated/);
        });

    const granted = pool.state.drone_user_access.find((row) => Number(row.user_id) === 3 && String(row.drone_id) === 'DRONE_01');
    assert.ok(granted, 'admin target should receive drone access');
    assert.equal(String(granted.access_level), 'full');
    assert.equal(Number(granted.granted_by), 2);

    const page_2 = await agent.get('/admin/users').expect(200);
    const csrf_2 = extract_csrf(page_2.text);

    await agent
        .post('/admin/users/3/drone-access/remove')
        .type('form')
        .send({ _csrf: csrf_2, drone_id: 'DRONE_01' })
        .expect(302)
        .expect((res) => {
            assert.match(String(res.headers.location || ''), /drone_access_removed/);
        });

    assert.equal(pool.state.drone_user_access.length, 0);

    const page_3 = await agent.get('/admin/users').expect(200);
    const csrf_3 = extract_csrf(page_3.text);

    await agent
        .post('/admin/users/1/drone-access')
        .type('form')
        .send({ _csrf: csrf_3, drone_id: 'DRONE_01', access_level: 'read' })
        .expect(302)
        .expect((res) => {
            assert.match(String(res.headers.location || ''), /forbidden_target/);
        });
});

test('user drone pages enforce read/full access and state gates', async () => {
    const pool = new FakePool({
        users: [{
            id: 10,
            username: 'pilot',
            email: 'pilot@example.test',
            password_hash: 'x',
            role: 'user',
            status: 'active',
            is_protected: 0
        }],
        drones: [
            { drone_id: 'READ_01', display_name: 'Read Drone', is_connected: 1, is_active: 1, is_locked: 0, last_seen_at: new Date() },
            { drone_id: 'FULL_01', display_name: 'Full Drone', is_connected: 1, is_active: 1, is_locked: 0, last_seen_at: new Date() },
            { drone_id: 'LOCK_01', display_name: 'Locked Drone', is_connected: 1, is_active: 1, is_locked: 1, last_seen_at: new Date() },
            { drone_id: 'OFF_01', display_name: 'Inactive Drone', is_connected: 0, is_active: 0, is_locked: 0, last_seen_at: new Date() },
            { drone_id: 'HIDDEN_01', display_name: 'Hidden Drone', is_connected: 1, is_active: 1, is_locked: 0, last_seen_at: new Date() }
        ],
        drone_user_access: [
            { id: 1, user_id: 10, drone_id: 'READ_01', access_level: 'read' },
            { id: 2, user_id: 10, drone_id: 'FULL_01', access_level: 'full' },
            { id: 3, user_id: 10, drone_id: 'LOCK_01', access_level: 'full' },
            { id: 4, user_id: 10, drone_id: 'OFF_01', access_level: 'full' }
        ],
        drone_control_parameters: [
            {
                drone_id: 'FULL_01',
                kp_ar: 1, ki_ar: 1, kd_ar: 1,
                kp_ap: 1, ki_ap: 1, kd_ap: 1,
                kp_rr: 1, ki_rr: 1, kd_rr: 1,
                kp_rp: 1, ki_rp: 1, kd_rp: 1,
                kp_ry: 1, ki_ry: 1, kd_ry: 1,
                source: 'default',
                updated_at: new Date()
            }
        ],
        telemetry: [
            { drone_id: 'FULL_01', received_at: new Date(), is_valid: 1, tick: 1000 }
        ],
        step_runs: [
            { drone_id: 'FULL_01', is_deleted: 0 }
        ]
    });

    const app = create_test_app({
        pool: pool,
        mount: (instance) => {
            const user_drones_router = require(path.join(project_root, 'src', 'routes', 'user_drones.js'));
            instance.use('/', user_drones_router);
        }
    });

    const agent = request.agent(app);
    await agent.get('/__as/10').expect(204);

    const list_page = await agent.get('/my-drones').expect(200);
    assert.match(list_page.text, /READ_01/);
    assert.match(list_page.text, /FULL_01/);
    assert.doesNotMatch(list_page.text, /HIDDEN_01/);

    const read_detail = await agent.get('/my-drones/READ_01').expect(200);
    const read_csrf = extract_csrf(read_detail.text);
    await agent
        .post('/my-drones/READ_01/actions/reboot')
        .type('form')
        .send({ _csrf: read_csrf })
        .expect(302)
        .expect((res) => {
            assert.match(String(res.headers.location || ''), /full_access_required/);
        });

    const locked_detail = await agent.get('/my-drones/LOCK_01').expect(200);
    const locked_csrf = extract_csrf(locked_detail.text);
    await agent
        .post('/my-drones/LOCK_01/actions/tune')
        .type('form')
        .send({ _csrf: locked_csrf })
        .expect(302)
        .expect((res) => {
            assert.match(String(res.headers.location || ''), /drone_locked/);
        });

    const inactive_detail = await agent.get('/my-drones/OFF_01').expect(200);
    const inactive_csrf = extract_csrf(inactive_detail.text);
    await agent
        .post('/my-drones/OFF_01/actions/reboot')
        .type('form')
        .send({ _csrf: inactive_csrf })
        .expect(302)
        .expect((res) => {
            assert.match(String(res.headers.location || ''), /drone_inactive/);
        });

    const full_detail = await agent.get('/my-drones/FULL_01').expect(200);
    const full_csrf = extract_csrf(full_detail.text);
    await agent
        .post('/my-drones/FULL_01/actions/reboot')
        .type('form')
        .send({ _csrf: full_csrf })
        .expect(302)
        .expect((res) => {
            assert.match(String(res.headers.location || ''), /action_placeholder/);
        });
});

test('admin my-drones page shows only assigned drones and blocks unassigned details', async () => {
    const pool = new FakePool({
        users: [{
            id: 20,
            username: 'admin_viewer',
            email: 'admin_viewer@example.test',
            password_hash: 'x',
            role: 'admin',
            status: 'active',
            is_protected: 0
        }],
        drones: [
            { drone_id: 'ADMIN_01', display_name: 'Assigned Admin Drone', is_connected: 1, is_active: 1, is_locked: 0, last_seen_at: new Date() },
            { drone_id: 'ADMIN_02', display_name: 'Hidden Admin Drone', is_connected: 1, is_active: 1, is_locked: 0, last_seen_at: new Date() }
        ],
        drone_user_access: [
            { id: 1, user_id: 20, drone_id: 'ADMIN_01', access_level: 'read' }
        ]
    });

    const app = create_test_app({
        pool: pool,
        mount: (instance) => {
            const user_drones_router = require(path.join(project_root, 'src', 'routes', 'user_drones.js'));
            instance.use('/', user_drones_router);
        }
    });

    const agent = request.agent(app);
    await agent.get('/__as/20').expect(204);

    const list_page = await agent.get('/my-drones').expect(200);
    assert.match(list_page.text, /ADMIN_01/);
    assert.doesNotMatch(list_page.text, /ADMIN_02/);
    assert.match(list_page.text, /read/);

    await agent.get('/my-drones/ADMIN_01').expect(200);
    await agent.get('/my-drones/ADMIN_02').expect(404);
});
