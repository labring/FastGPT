import { createDocument } from 'zod-openapi';
import { openAPIPaths, openAPITagGroups } from '../path';
import { SystemOpenApiTagMap } from '../tag';
import type { OpenAPIPath } from '../type';

type DefinedOpenAPIPath = NonNullable<OpenAPIPath>;

/**
 * Dev API 是完整开发者文档，SystemOpenAPI 标签只作为 systemopenapi 的筛选标记。
 * 这里复制并过滤 operation tags，避免内部筛选标签展示到 Dev API 文档中。
 */
const omitSystemOpenApiTags = (paths: DefinedOpenAPIPath) => {
  const systemOpenApiTagSet = new Set<string>(Object.values(SystemOpenApiTagMap));
  const filteredPaths: DefinedOpenAPIPath = {};

  for (const [path, pathItem] of Object.entries(paths)) {
    const filteredPathItem: NonNullable<DefinedOpenAPIPath[string]> = {};

    for (const [method, operation] of Object.entries(pathItem ?? {})) {
      const tags = (operation as { tags?: string[] } | undefined)?.tags;

      filteredPathItem[method as keyof typeof filteredPathItem] = (
        tags
          ? {
              ...(operation as object),
              tags: tags.filter((tag) => !systemOpenApiTagSet.has(tag))
            }
          : operation
      ) as never;
    }

    filteredPaths[path] = filteredPathItem;
  }

  return filteredPaths;
};

export const openAPIDocument = createDocument({
  openapi: '3.1.0',
  info: {
    title: 'FastGPT Dev API',
    version: '0.1.0',
    description: 'FastGPT 所有 API 的文档'
  },
  paths: omitSystemOpenApiTags(openAPIPaths),
  servers: [{ url: '/api' }],
  'x-tagGroups': openAPITagGroups
});
