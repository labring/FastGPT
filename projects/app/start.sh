#!/bin/sh
cd /app/plugins/nodejs-websocket-bridge && node server.js &
node --max-old-space-size=4096 ${serverPath}
