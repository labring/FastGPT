import { createDocument } from 'zod-openapi';
import { SystemOpenApiTagMap } from '../tag';
import { openAPIPaths } from '../path';
import type { OpenAPIPath } from '../type';

const ApiKeyTagNameMap: Record<string, string> = {
  [SystemOpenApiTagMap.appLog]: '应用日志',

  [SystemOpenApiTagMap.chatHistory]: '会话管理',
  [SystemOpenApiTagMap.chat]: '对话管理',
  [SystemOpenApiTagMap.chatFeedback]: '反馈管理',
  [SystemOpenApiTagMap.chatController]: '会话操作',

  [SystemOpenApiTagMap.dataset]: '知识库管理',
  [SystemOpenApiTagMap.datasetCollection]: '集合管理',
  [SystemOpenApiTagMap.datasetCollectionCreate]: '集合创建',
  [SystemOpenApiTagMap.datasetData]: '数据管理',
  [SystemOpenApiTagMap.datasetDataIndex]: '索引管理',
  [SystemOpenApiTagMap.datasetOther]: '其他'
};

export const tagGroups = [
  {
    name: '应用管理',
    tags: [ApiKeyTagNameMap[SystemOpenApiTagMap.appLog]]
  },
  {
    name: '应用对话',
    tags: [
      ApiKeyTagNameMap[SystemOpenApiTagMap.chatHistory],
      ApiKeyTagNameMap[SystemOpenApiTagMap.chat],
      ApiKeyTagNameMap[SystemOpenApiTagMap.chatFeedback],
      ApiKeyTagNameMap[SystemOpenApiTagMap.chatController]
    ]
  },
  {
    name: '知识库',
    tags: [
      ApiKeyTagNameMap[SystemOpenApiTagMap.dataset],
      ApiKeyTagNameMap[SystemOpenApiTagMap.datasetCollection],
      ApiKeyTagNameMap[SystemOpenApiTagMap.datasetCollectionCreate],
      ApiKeyTagNameMap[SystemOpenApiTagMap.datasetData],
      ApiKeyTagNameMap[SystemOpenApiTagMap.datasetDataIndex],
      ApiKeyTagNameMap[SystemOpenApiTagMap.datasetOther]
    ]
  }
];

type DefinedOpenAPIPath = NonNullable<OpenAPIPath>;

/**
 * System OpenAPI 只展示显式打了 SystemOpenApiTagMap 标签的 operation。
 *
 * 主文档继续保留原有业务标签；这里在生成 System OpenAPI 文档时过滤并重写 tags，
 * 避免没有开放的同模块接口被带入 /apidoc/systemopenapi。
 */
const pickApiKeyPathsByTags = (paths: DefinedOpenAPIPath) => {
  const apiKeyTags = new Set<string>(Object.values(SystemOpenApiTagMap));
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
    title: 'FastGPT System OpenAPI',
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
        description:
          '在 Authorization 请求头中传入 Bearer <apiKey>。除 chat/completions 外，对话相关接口必须在 body/query 中显式传入 appId。chat/completions 推荐传 body.appId；为兼容 OpenAI SDK，也允许 Bearer <apiKey>-<appId>，该后缀仅作为传输兼容，不会写入数据库。'
      }
    }
  },
  security: [{ ApiKeyAuth: [] }],
  'x-tagGroups': tagGroups
});
