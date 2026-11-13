import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap, SystemOpenApiTagMap } from '../../../tag';
import { SearchDatasetBodySchema, SearchDatasetResponseSchema } from './api';

export const DatasetSearchPath: OpenAPIPath = {
  '/core/dataset/search': {
    post: {
      summary: '联合搜索知识库',
      description:
        '使用 API Key 或登录态联合检索多个可读知识库。向量召回要求有效 embedding 模型一致；结果按集合权限过滤。result.topk 与 result.maxTokens 二选一；都不传时默认 topk=20，不设置 token 预算。topk 返回排序后的前 1–100 条，不做 token 过滤；maxTokens 按完整数据块 token 预算截断，无业务上限。为兼容同时传入两种预算的请求，HTTP 入口优先保留 topk 并忽略 maxTokens。响应 meta 只包含实际执行信息。',
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
