import { createNextRoute, createNextRouter } from '@ts-rest/next';
import { contract } from './contract';
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

const hasCustomTags = (metadata: unknown): metadata is { openApiTags: string[] } => {
  return !!metadata && typeof metadata === 'object' && 'openApiTags' in metadata;
};

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
      servers: [{ url: '/api' }]
    },
    {
      operationMapper(operation, appRoute) {
        return {
          ...operation,
          ...(hasCustomTags(appRoute.metadata)
            ? {
                tags: appRoute.metadata.openApiTags
              }
            : {})
        };
      },
      setOperationId: true
    }
  );
}
