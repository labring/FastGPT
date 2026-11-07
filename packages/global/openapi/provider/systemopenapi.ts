import { createDocument } from 'zod-openapi';
import { openApiDocumentOptions } from '../generation';
import { setRequiredRequestExamples } from '../requiredExamples';
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
  [SystemOpenApiTagMap.datasetOther]: '其他',

  [SystemOpenApiTagMap.model]: '模型管理'
};

export const tagGroups = [
  {
    name: '基础功能',
    tags: [ApiKeyTagNameMap[SystemOpenApiTagMap.model]]
  },
  {
    name: '应用管理',
    tags: [ApiKeyTagNameMap[SystemOpenApiTagMap.appLog]]
  },
  {
    name: '对话',
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

export const apiDocOpenAPIDocument = setRequiredRequestExamples(
  createDocument(
    {
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
              '在 Authorization 请求头中传入 Bearer <apiKey>。应用 API Key 自动使用绑定的应用，对话及配套管理接口无需传 appId；显式 appId 或 SDK 后缀不能覆盖 Key 绑定。个人密钥调用应用会话接口需提供 appId；chat/completions 推荐传 body.appId，为兼容 OpenAI SDK 也支持 Bearer <apiKey>-<appId>。SDK 后缀仅作为传输兼容，不会写入数据库。'
          }
        }
      },
      security: [{ ApiKeyAuth: [] }],
      'x-tagGroups': tagGroups
    },
    openApiDocumentOptions
  ),
  apiKeyOpenAPIPaths
);
