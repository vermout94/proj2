'use strict';

const http = require('http');
const { createApp } = require('./src/app');
const config = require('./src/config');

const app = createApp();
const server = http.createServer(app);

server.listen(config.port, config.host, () => {
    console.log(`Listening on http://${config.host}:${config.port}`);
});
