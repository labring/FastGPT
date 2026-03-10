import { OpenAPIHono } from '@hono/zod-openapi';
import { Scalar } from '@scalar/hono-api-reference';
import { env } from './env';
import { authMiddleware, errorHandler, loggerMiddleware } from './middleware';
import { createSealosClient } from './clients';
import { createContainerRoutes, createSandboxRoutes } from './routes';
import { configureLogger, getLogger, LogCategories } from './utils';

await configureLogger();
const logger = getLogger(LogCategories.SERVER);

// Create Hono app with OpenAPI support
const app = new OpenAPIHono();

// Global error handler
app.onError(errorHandler);

// Global logger middleware
app.use('*', loggerMiddleware);

// Create Sealos client
const sealosClient = createSealosClient();

// ==================== Public Routes ====================

// Health check endpoint (no auth required)
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// OpenAPI JSON document
app.doc31('/openapi.json', {
  openapi: '3.1.0',
  info: {
    title: 'Sandbox Server API',
    version: '1.0.0',
    description: 'API for managing sandbox containers via Sealos',
    license: {
      name: 'Apache 2.0',
      url: 'https://www.apache.org/licenses/LICENSE-2.0.html'
    }
  },
  servers: [
    {
      url: `http://localhost:${env.PORT}`,
      description: 'Local development server'
    }
  ]
});

// Scalar API Reference UI
app.get(
  '/openapi',
  Scalar({
    url: '/openapi.json',
    theme: 'default',
    defaultOpenAllTags: true,
    expandAllModelSections: true,
    expandAllResponses: true
  })
);

// ==================== Protected Routes ====================

// Create v1 router with authentication
const v1 = new OpenAPIHono();
v1.use('*', authMiddleware);

// Mount container routes
v1.route('/', createContainerRoutes(sealosClient));

// Mount sandbox routes
v1.route('/', createSandboxRoutes(sealosClient));

// Mount v1 router
app.route('/v1', v1);

// ==================== Start Server ====================

logger.info(`Starting on port ${env.PORT}`);
logger.info(`API Documentation: http://localhost:${env.PORT}/openapi/ui`);

export default {
  port: env.PORT,
  fetch: app.fetch
};

// Export app for testing
export { app };
