import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  CreateContainerSchema,
  ContainerInfoResponseSchema,
  SuccessResponseSchema,
  ErrorResponseSchema
} from '../schemas';
import type { SealosClient } from '../clients';

// ==================== Route Definitions ====================

const createContainerRoute = createRoute({
  method: 'post',
  path: '/containers',
  tags: ['Container'],
  summary: 'Create a new container',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateContainerSchema
        }
      }
    }
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: SuccessResponseSchema
        }
      },
      description: 'Container created successfully'
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      },
      description: 'Bad request'
    }
  }
});

const getContainerRoute = createRoute({
  method: 'get',
  path: '/containers/{name}',
  tags: ['Container'],
  summary: 'Get container information',
  request: {
    params: z.object({
      name: z.string().openapi({ param: { name: 'name', in: 'path' }, example: 'my-container' })
    })
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ContainerInfoResponseSchema
        }
      },
      description: 'Container information'
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

const pauseContainerRoute = createRoute({
  method: 'post',
  path: '/containers/{name}/pause',
  tags: ['Container'],
  summary: 'Pause a running container',
  request: {
    params: z.object({
      name: z.string().openapi({ param: { name: 'name', in: 'path' }, example: 'my-container' })
    })
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: SuccessResponseSchema
        }
      },
      description: 'Container paused successfully'
    }
  }
});

const startContainerRoute = createRoute({
  method: 'post',
  path: '/containers/{name}/start',
  tags: ['Container'],
  summary: 'Start a paused container',
  request: {
    params: z.object({
      name: z.string().openapi({ param: { name: 'name', in: 'path' }, example: 'my-container' })
    })
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: SuccessResponseSchema
        }
      },
      description: 'Container started successfully'
    }
  }
});

const deleteContainerRoute = createRoute({
  method: 'delete',
  path: '/containers/{name}',
  tags: ['Container'],
  summary: 'Delete a container',
  request: {
    params: z.object({
      name: z.string().openapi({ param: { name: 'name', in: 'path' }, example: 'my-container' })
    })
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: SuccessResponseSchema
        }
      },
      description: 'Container deleted successfully'
    }
  }
});

// ==================== Controller Factory ====================

export const createContainerRoutes = (sealosClient: SealosClient) => {
  const app = new OpenAPIHono();

  // POST /containers - Create container
  app.openapi(createContainerRoute, async (c) => {
    const body = c.req.valid('json');
    await sealosClient.createContainer(body);
    return c.json({ success: true as const }, 200);
  });

  // GET /containers/:name - Get container info
  app.openapi(getContainerRoute, async (c) => {
    const { name } = c.req.valid('param');
    const container = await sealosClient.getContainer(name);

    if (!container) {
      return c.json({ success: false as const, message: 'Container not found' }, 404);
    }

    return c.json({ success: true as const, data: container }, 200);
  });

  // POST /containers/:name/pause - Pause container
  app.openapi(pauseContainerRoute, async (c) => {
    const { name } = c.req.valid('param');
    await sealosClient.pauseContainer(name);
    return c.json({ success: true as const }, 200);
  });

  // POST /containers/:name/start - Start container
  app.openapi(startContainerRoute, async (c) => {
    const { name } = c.req.valid('param');
    await sealosClient.resumeContainer(name);
    return c.json({ success: true as const }, 200);
  });

  // DELETE /containers/:name - Delete container
  app.openapi(deleteContainerRoute, async (c) => {
    const { name } = c.req.valid('param');
    await sealosClient.deleteContainer(name);
    return c.json({ success: true as const }, 200);
  });

  return app;
};
