#!/usr/bin/env node
// bin/server.ts
// HTTP Server Entry Point

import { serve } from '@hono/node-server';
import { startServer } from '../src/apps/server/index';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const port = parseInt(process.env.AGENTIC_PORT || '3123', 10);
const host = process.env.AGENTIC_HOST || '0.0.0.0';

async function main() {
  const { app, info } = await startServer({
    port,
    host
  });

  // Create and start the HTTP server using @hono/node-server
  const server = serve({
    fetch: app.fetch,
    port,
    hostname: host
  });

  console.log(`\n✅ Server running at http://${info.host}:${info.port}`);
  console.log('Endpoints:');
  console.log('  GET  /health');
  console.log('  POST /v1/agentic/search');
  console.log('  POST /v1/agentic/stream');
  console.log('  GET  /v1/agentic/playbooks');

  // Handle shutdown gracefully
  process.on('SIGINT', () => {
    console.log('\nShutting down server...');
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
}

main().catch(console.error);
