import { createNextRoute, createNextRouter } from '@ts-rest/next';
import { contract } from './contract';
import type { AppRoute } from '@ts-rest/core';
import type { Args, Handler, Endpoint } from './types';
import { generateOpenApi } from '@ts-rest/open-api';

export function createServerRoute(
  implementation: Parameters<typeof createNextRoute<typeof contract>>[1]
) {
  return createNextRoute(contract, implementation);
}

export function createServerRouter(
  router: Parameters<typeof createNextRouter<typeof contract>>[1]
) {
  return createNextRouter(contract, router);
}

export type OpenAPIObject = ReturnType<typeof generateOpenApi>;
export function generateOpenApiDocument(c: typeof contract): OpenAPIObject {
  return generateOpenApi(
    c,
    {
      info: {
        title: 'FastGPT OpenAPI',
        version: '4.12.4',
        description: 'FastGPT OpenAPI'
      },
      servers: [
        {
          url: '/api'
        }
      ]
    },
    {
      setOperationId: true
    }
  );
}
