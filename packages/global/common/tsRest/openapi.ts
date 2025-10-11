import type { contract } from './fastgpt/contracts';
import { generateOpenApi } from '@ts-rest/open-api';

const hasCustomTags = (metadata: unknown): metadata is { tags: string[] } => {
  return !!metadata && typeof metadata === 'object' && 'tags' in metadata;
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
                tags: appRoute.metadata.tags
              }
            : {})
        };
      },
      setOperationId: false
    }
  );
}
