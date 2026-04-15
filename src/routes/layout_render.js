'use strict';

function renderLayout(res, options) {
    const user = options.user || null;

    return res.render('layout', {
        title: options.title || '',
        showTopNav: Boolean(options.showTopNav),
        activeNav: options.activeNav || '',
        user,
        contentView: options.contentView || null,
        contentData: options.contentData || {}
    });
}

module.exports = { renderLayout };
