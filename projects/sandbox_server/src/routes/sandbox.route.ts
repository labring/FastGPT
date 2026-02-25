import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  ExecRequestSchema,
  ExecResultResponseSchema,
  HealthCheckResponseSchema,
  ErrorResponseSchema
} from '../schemas';
import { createSandboxClient, type SealosClient } from '../clients';

// ==================== Route Definitions ====================

const execRoute = createRoute({
  method: 'post',
  path: '/sandbox/{name}/exec',
  tags: ['Sandbox'],
  summary: 'Execute a command in the sandbox',
  request: {
    params: z.object({
      name: z.string().openapi({ param: { name: 'name', in: 'path' }, example: 'my-container' })
    }),
    body: {
      content: {
        'application/json': {
          schema: ExecRequestSchema
        }
      }
    }
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ExecResultResponseSchema
        }
      },
      description: 'Command executed successfully'
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      },
      description: 'Bad request'
    },
    404: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      },
      description: 'Container not found'
    }
  }
});

const healthRoute = createRoute({
  method: 'get',
  path: '/sandbox/{name}/health',
  tags: ['Sandbox'],
  summary: 'Check sandbox health',
  request: {
    params: z.object({
      name: z.string().openapi({ param: { name: 'name', in: 'path' }, example: 'my-container' })
    })
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: HealthCheckResponseSchema
        }
      },
      description: 'Health check result'
    },
    404: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      },
      description: 'Container not found'
    }
  }
});

// ==================== Controller Factory ====================

/**
 * Factory function to create sandbox routes
 * @param sealosClient - Sealos client to get container info for sandbox URL
 */
export const createSandboxRoutes = (sealosClient: SealosClient) => {
  const app = new OpenAPIHono();

  /**
   * Get sandbox client by container name
   * Retrieves container info to get the sandbox server URL
   */
  const getSandboxClient = async (name: string) => {
    const container = await sealosClient.getContainer(name);
    if (!container || !container.server) {
      throw new Error('Container not found or has no server info');
    }

    // Build sandbox URL from container server info
    let baseUrl: string;
    if (container.server.publicDomain && container.server.domain) {
      baseUrl = `https://${container.server.publicDomain}.${container.server.domain}`;
    } else {
      baseUrl = `http://${container.server.serviceName}:${container.server.number}`;
    }

    return createSandboxClient(baseUrl);
  };

  // POST /sandbox/:name/exec - Execute command
  app.openapi(execRoute, async (c) => {
    const { name } = c.req.valid('param');
    const body = c.req.valid('json');

    try {
      const sandboxClient = await getSandboxClient(name);
      const result = await sandboxClient.exec(body);
      return c.json({ success: true as const, data: result }, 200);
    } catch (err) {
      if (err instanceof Error && err.message.includes('not found')) {
        return c.json({ success: false as const, message: 'Container not found' }, 404);
      }
      throw err;
    }
  });

  // GET /sandbox/:name/health - Health check
  app.openapi(healthRoute, async (c) => {
    const { name } = c.req.valid('param');

    try {
      const sandboxClient = await getSandboxClient(name);
      const healthy = await sandboxClient.isHealthy();
      return c.json({ success: true as const, healthy }, 200);
    } catch (err) {
      if (err instanceof Error && err.message.includes('not found')) {
        return c.json({ success: false as const, message: 'Container not found' }, 404);
      }
      throw err;
    }
  });

  return app;
};
