import { createDocument } from 'zod-openapi';
import { AppOpenApiTagMap } from '../tag';
import { openAPIPaths } from '../path';
import type { OpenAPIPath } from '../type';

const AppOpenApiTagNameMap: Record<string, string> = {
  [AppOpenApiTagMap.appLog]: '应用日志',
  [AppOpenApiTagMap.chatHistory]: '会话管理',
  [AppOpenApiTagMap.chat]: '对话管理',
  [AppOpenApiTagMap.chatController]: '会话操作'
};

type DefinedOpenAPIPath = NonNullable<OpenAPIPath>;

/**
 * App OpenAPI 只展示应用级 APIKey 面向应用使用者开放的一级分类。
 *
 * 这里使用独立的 AppOpenApiTagMap 打标，避免 App OpenAPI 与 System OpenAPI
 * 在接口开放范围上互相影响。
 */
const pickAppOpenApiPathsByTags = (paths: DefinedOpenAPIPath) => {
  const appOpenApiTags = new Set<string>(Object.keys(AppOpenApiTagNameMap));
  const pickedPaths: DefinedOpenAPIPath = {};

  for (const [path, pathItem] of Object.entries(paths)) {
    const pickedPathItem: NonNullable<DefinedOpenAPIPath[string]> = {};

    for (const [method, operation] of Object.entries(pathItem ?? {})) {
      const tags = (operation as { tags?: string[] } | undefined)?.tags ?? [];
      const pickedTags = tags.filter((tag) => appOpenApiTags.has(tag));

      if (pickedTags.length > 0) {
        pickedPathItem[method as keyof typeof pickedPathItem] = {
          ...(operation as object),
          tags: [...new Set(pickedTags.map((tag) => AppOpenApiTagNameMap[tag]))]
        } as never;
      }
    }

    if (Object.keys(pickedPathItem).length > 0) {
      pickedPaths[path] = pickedPathItem;
    }
  }

  return pickedPaths;
};

const appOpenAPIPaths = pickAppOpenApiPathsByTags(openAPIPaths);

export const appOpenAPIDocument = createDocument({
  openapi: '3.1.0',
  info: {
    title: 'FastGPT App OpenAPI',
    version: '0.1.0',
    description: 'FastGPT 应用级开放 API 文档，仅包含应用日志、会话管理、对话管理和会话操作接口。'
  },
  paths: appOpenAPIPaths,
  servers: [{ url: '/api' }],
  components: {
    securitySchemes: {
      AppApiKeyAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'App API Key',
        description: '在 Authorization 请求头中传入 Bearer <appApiKey>。'
      }
    }
  },
  security: [{ AppApiKeyAuth: [] }]
});
