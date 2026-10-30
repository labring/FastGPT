import type { z } from 'zod';
import {
  DatasetSearchParamsSchema,
  DatasetSearchResultSchema
} from '../../../../core/dataset/search/type';

/* ============================================================================
 * API: 联合搜索知识库
 * Route: POST /api/core/dataset/search
 * Method: POST
 * Description: 按调用成员权限联合搜索多个知识库，统一召回、重排与结果预算
 * Tags: ['Dataset', 'Search']
 * ============================================================================ */
export const SearchDatasetBodySchema = DatasetSearchParamsSchema.meta({
  description: '结构化多知识库检索参数；身份由 Authorization API Key 或登录态解析'
});
export type SearchDatasetBody = z.input<typeof SearchDatasetBodySchema>;
export const SearchDatasetResponseSchema = DatasetSearchResultSchema.meta({
  description: '合并排序后的命中片段及实际搜索配置'
});
export type SearchDatasetResponse = z.infer<typeof SearchDatasetResponseSchema>;
