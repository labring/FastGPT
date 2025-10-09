import { createNextRoute, createNextRouter } from '@ts-rest/next';
import { contract, coreContract, proContract } from './contract';
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

/**
 * 创建开源版路由器
 * 只需实现开源接口，Pro 接口通过 /proApi/[...path].ts 转发
 */
export function createCoreRouter(
  router: Parameters<typeof createNextRouter<typeof coreContract>>[1]
) {
  return createNextRouter(coreContract, router);
}

/**
 * 创建 Pro 单个路由
 */
export function createProServerRoute(
  implementation: Parameters<typeof createNextRoute<typeof proContract>>[1]
) {
  return createNextRoute(proContract, implementation);
}

/**
 * 创建 Pro 路由器
 * 只需实现 Pro 接口（路径已自动转换 /proApi → 空）
 */
export function createProServerRouter(
  router: Parameters<typeof createNextRouter<typeof proContract>>[1]
) {
  return createNextRouter(proContract, router);
}

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
