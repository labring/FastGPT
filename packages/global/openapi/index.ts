import { createDocument } from 'zod-openapi';
import { openAPIPaths, openAPITagGroups } from './path';
import { ApiKeyTagMap } from './apikey/tag';

const openAPITagSet = new Set<string>(Object.values(ApiKeyTagMap));

const openAPIDocumentPaths = Object.fromEntries(
  Object.entries(openAPIPaths).map(([path, pathItem]) => [
    path,
    Object.fromEntries(
      Object.entries(pathItem ?? {}).map(([method, operation]) => {
        const tags = (operation as { tags?: string[] } | undefined)?.tags;

        return [
          method,
          tags
            ? {
                ...(operation as object),
                // ApiKeyTagMap 只作为 /openapi 的筛选标记，不展示在全量开发者文档里。
                tags: tags.filter((tag) => !openAPITagSet.has(tag))
              }
            : operation
        ];
      })
    )
  ])
) as typeof openAPIPaths;

export const openAPIDocument = createDocument({
  openapi: '3.1.0',
  info: {
    title: 'FastGPT API',
    version: '0.1.0',
    description: 'FastGPT API 文档'
  },
  paths: openAPIDocumentPaths,
  servers: [{ url: '/api' }],
  'x-tagGroups': openAPITagGroups
});
