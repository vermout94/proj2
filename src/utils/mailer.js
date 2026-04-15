'use strict';

const nodemailer = require('nodemailer');
const config = require('../config');

let cached_transporter = null;

function smtp_enabled() {
    return (
        String(config.smtp.host || '').trim().length > 0 &&
        String(config.smtp.user || '').trim().length > 0 &&
        String(config.smtp.pass || '').trim().length > 0
    );
}

function get_transporter() {
    if (cached_transporter) {
        return cached_transporter;
    }

    cached_transporter = nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        auth: {
            user: config.smtp.user,
            pass: config.smtp.pass
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 20000,
        tls: {
            servername: config.smtp.host,
            rejectUnauthorized: config.smtp.tlsRejectUnauthorized
        }
    });

    return cached_transporter;
}

async function send_text_mail(to_email, subject_text, body_text) {
    if (!smtp_enabled()) {
        return { ok: false, error: 'smtp_not_configured' };
    }

    try {
        const transporter = get_transporter();
        await transporter.sendMail({
            from: config.smtp.from,
            to: String(to_email || '').trim(),
            subject: String(subject_text || '').trim(),
            text: String(body_text || '')
        });
        return { ok: true };
    } catch (error) {
        return {
            ok: false,
            error: error && error.message ? error.message : 'mail_send_failed'
        };
    }
}

module.exports = {
    smtp_enabled,
    send_text_mail
};
