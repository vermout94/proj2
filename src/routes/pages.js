'use strict';

const express = require('express');
const {
    require_auth,
    require_admin_or_super,
    require_super_admin
} = require('../auth/middleware');
const { renderLayout } = require('./layout_render');

const router = express.Router();

router.get('/', (req, res) => {
    if (req.session && req.session.user) {
        return res.redirect('/dashboard');
    }

    return res.redirect('/login');
});

router.get('/dashboard', require_auth, (req, res) => {
    return renderLayout(res, {
        title: 'Dashboard',
        showTopNav: true,
        activeNav: 'dashboard',
        user: req.session.user,
        contentView: 'dashboard',
        contentData: {
            role: req.session.user.role
        }
    });
});

router.get('/admin', require_admin_or_super, (req, res) => {
    return res.redirect('/admin/users');
});

router.get('/super-admin', require_super_admin, (req, res) => {
    return renderLayout(res, {
        title: 'Super Admin Area',
        showTopNav: true,
        activeNav: '',
        user: req.session.user,
        contentView: null,
        contentData: {
            heading: 'Super Admin Area',
            message: 'Access granted only for super admin.'
        }
    });
});

module.exports = router;
