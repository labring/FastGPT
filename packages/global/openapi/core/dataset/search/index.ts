import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap, SystemOpenApiTagMap } from '../../../tag';
import { SearchDatasetBodySchema, SearchDatasetResponseSchema } from './api';

export const DatasetSearchPath: OpenAPIPath = {
  '/core/dataset/search': {
    post: {
      summary: '联合搜索知识库',
      description:
        '使用 API Key 或登录态联合检索多个可读知识库。向量召回要求有效 embedding 模型一致；结果按集合权限过滤。maxTokens 为完整数据块预算，最后一块可能超出预算。',
      tags: [DevApiTagsMap.datasetCommon, SystemOpenApiTagMap.datasetOther],
      requestBody: { content: { 'application/json': { schema: SearchDatasetBodySchema } } },
      responses: {
        200: {
          description: '命中片段和实际检索配置',
          content: { 'application/json': { schema: SearchDatasetResponseSchema } }
        }
      }
    }
  }
};
