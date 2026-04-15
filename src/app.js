'use strict';

const path = require('path');
const express = require('express');
const helmet = require('helmet');

const { createSessionMiddleware } = require('./auth/session');
const { attach_csrf_token, csrf_protect } = require('./security/csrf');
const authRouter = require('./routes/auth');
const pagesRouter = require('./routes/pages');
const adminUsersRouter = require('./routes/admin_users');
const adminDronesRouter = require('./routes/admin_drones');
const userDronesRouter = require('./routes/user_drones');

function createApp() {
    const app = express();

    app.disable('x-powered-by');
    app.set('trust proxy', 1);

    app.use(helmet({
        contentSecurityPolicy: false
    }));

    app.use(express.urlencoded({ extended: false }));
    app.use(express.json({ limit: '1mb' }));

    app.use('/public', express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, 'views'));

    app.use(createSessionMiddleware());
    app.use(attach_csrf_token);
    app.use(csrf_protect);

    app.use((req, res, next) => {
        res.locals.user = (req.session && req.session.user) ? req.session.user : null;
        res.locals.isAdmin = !!(res.locals.user && (res.locals.user.role === 'admin' || res.locals.user.role === 'super_admin'));
        res.locals.isSuperAdmin = !!(res.locals.user && res.locals.user.role === 'super_admin');
        res.locals.csrfToken = req.csrf_token || '';
        next();
    });

    app.get('/health', (req, res) => {
        res.status(200).send('OK\n');
    });

    app.use('/', authRouter);
    app.use('/', userDronesRouter);
    app.use('/', adminUsersRouter);
    app.use('/', adminDronesRouter);
    app.use('/', pagesRouter);

    app.use((req, res) => {
        res.status(404).render('layout', {
            title: 'Not Found',
            showTopNav: false,
            activeNav: '',
            user: null,
            contentView: null,
            contentData: {
                heading: 'Not Found',
                message: 'The requested page does not exist.'
            }
        });
    });

    return app;
}

module.exports = { createApp };
