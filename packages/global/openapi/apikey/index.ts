import { createDocument } from 'zod-openapi';
import { openAPIPaths } from '../path';
import type { OpenAPIPath } from '../type';
import { ApiKeyTagMap, ApiKeyTagNameMap, apiKeyTagGroups } from './tag';

type DefinedOpenAPIPath = NonNullable<OpenAPIPath>;

/**
 * API key 文档只展示显式打了 ApiKeyTagMap 标签的 operation。
 *
 * 主文档继续保留原有业务标签；这里在生成 API key 专用文档时过滤并重写 tags，
 * 避免没有开放的同模块接口被带入 /openapi。
 */
const pickApiKeyPathsByTags = (paths: DefinedOpenAPIPath) => {
  const apiKeyTags = new Set<string>(Object.values(ApiKeyTagMap));
  const pickedPaths: DefinedOpenAPIPath = {};

  for (const [path, pathItem] of Object.entries(paths)) {
    const pickedPathItem: NonNullable<DefinedOpenAPIPath[string]> = {};

    for (const [method, operation] of Object.entries(pathItem ?? {})) {
      const tags = (operation as { tags?: string[] } | undefined)?.tags ?? [];
      const pickedTags = tags.filter((tag) => apiKeyTags.has(tag));

      if (pickedTags.length > 0) {
        pickedPathItem[method as keyof typeof pickedPathItem] = {
          ...(operation as object),
          tags: [...new Set(pickedTags.map((tag) => ApiKeyTagNameMap[tag]))]
        } as never;
      }
    }

    if (Object.keys(pickedPathItem).length > 0) {
      pickedPaths[path] = pickedPathItem;
    }
  }

  return pickedPaths;
};

const apiKeyOpenAPIPaths = pickApiKeyPathsByTags(openAPIPaths);

export const apiDocOpenAPIDocument = createDocument({
  openapi: '3.1.0',
  info: {
    title: 'FastGPT OpenAPI',
    version: '0.1.0',
    description: 'FastGPT 开放 API 文档，仅包含支持 API key 鉴权的接口。'
  },
  paths: apiKeyOpenAPIPaths,
  servers: [{ url: '/api' }],
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'API Key',
        description: '在 Authorization 请求头中传入 Bearer <apiKey>。'
      }
    }
  },
  security: [{ ApiKeyAuth: [] }],
  'x-tagGroups': apiKeyTagGroups
});
