import { z } from 'zod';
import {
  DatasetSearchParamsSchema,
  DatasetSearchResultSchema
} from '../../../../core/dataset/search/type';

/* ============================================================================
 * API: 知识库搜索
 * Route: POST /api/core/dataset/search
 * Method: POST
 * Description: 按调用成员权限联合搜索多个知识库，统一召回、重排与结果预算
 * Tags: ['Dataset', 'Search']
 * ============================================================================ */
// 账单用途属于 HTTP 应用层，只映射服务端固定名称，不进入检索领域参数。
export const SearchDatasetBodySchema = DatasetSearchParamsSchema.extend({
  usageScene: z.enum(['search', 'searchTest']).default('search').meta({
    description: '账单用途：search 显示知识库搜索，searchTest 显示搜索测试；不影响检索和权限',
    example: 'search'
  })
}).meta({ description: '结构化多知识库检索参数；身份由 Authorization API Key 或登录态解析' });
export type SearchDatasetBody = z.input<typeof SearchDatasetBodySchema>;

/**
 * HTTP 兼容双预算输入：显式 topk 优先并删除 maxTokens，再按互斥协议校验。
 * 只剥离被覆盖的预算；其他未知字段仍由严格 Schema 拒绝。文档与客户端使用上面的二选一协议。
 */
export const SearchDatasetRequestBodySchema = z.preprocess((input) => {
  if (typeof input !== 'object' || input === null || Array.isArray(input) || !('result' in input)) {
    return input;
  }
  const result = input.result;
  if (
    typeof result !== 'object' ||
    result === null ||
    Array.isArray(result) ||
    !('topk' in result) ||
    result.topk === undefined ||
    !('maxTokens' in result)
  ) {
    return input;
  }
  const { maxTokens, ...budget } = result;
  return { ...input, result: budget };
}, SearchDatasetBodySchema);
export type SearchDatasetRequestBody = z.output<typeof SearchDatasetRequestBodySchema>;

// HTTP 只返回实际执行信息；内部预算及入参回显保留给旧 searchTest 适配，不对外重复输出。
export const SearchDatasetResponseSchema = DatasetSearchResultSchema.extend({
  meta: DatasetSearchResultSchema.shape.meta.omit({
    searchMode: true,
    maxTokens: true,
    similarity: true
  })
}).meta({
  description: '合并排序后的命中片段及实际搜索配置'
});
export type SearchDatasetResponse = z.infer<typeof SearchDatasetResponseSchema>;
