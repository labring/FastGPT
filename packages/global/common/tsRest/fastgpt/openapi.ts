import { fastgptContract, type FadtGPTContractType } from './contracts';
import { generateOpenApi } from '@ts-rest/open-api';

const hasCustomTags = (metadata: unknown): metadata is { tags: string[] } => {
  return !!metadata && typeof metadata === 'object' && 'tags' in metadata;
};

type OpenAPIObject = ReturnType<typeof generateOpenApi>;
function generateOpenApiDocument(c: FadtGPTContractType): OpenAPIObject {
  return generateOpenApi(
    c,
    {
      info: {
        title: 'FastGPT OpenAPI',
        version: '4.13.2',
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

export const fastgptOpenApiDocument = generateOpenApiDocument(fastgptContract);
