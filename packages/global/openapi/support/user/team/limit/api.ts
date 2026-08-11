import { z } from 'zod';

/* ============================================================================
 * API: 检查团队知识库容量限制
 * Route: GET /api/support/user/team/limit/datasetSizeLimit
 * Method: GET
 * Description: 检查团队当前知识库索引容量和积分是否足以新增指定数量的数据
 * Tags: ['限流检查', 'Read']
 * ============================================================================ */

export const DatasetSizeLimitQuerySchema = z.object({
  size: z.coerce.number().optional().meta({
    example: 100,
    description: '预计新增的知识库索引数量；未传时直接返回检查通过'
  })
});
export type DatasetSizeLimitQuery = z.infer<typeof DatasetSizeLimitQuerySchema>;

export const DatasetSizeLimitResponseSchema = z.undefined().meta({
  description: '检查通过，无业务数据返回'
});
export type DatasetSizeLimitResponse = z.infer<typeof DatasetSizeLimitResponseSchema>;

/* ============================================================================
 * API: 检查团队知识库导出频率限制
 * Route: GET /api/support/user/team/limit/exportDatasetLimit
 * Method: GET
 * Description: 检查指定知识库是否具备导出权限，并校验团队导出冷却时间
 * Tags: ['限流检查', 'Read']
 * ============================================================================ */

export const ExportDatasetLimitQuerySchema = z.object({
  datasetId: z.string().min(1).meta({
    example: '68ad85a7463006c963799a05',
    description: '需要导出的知识库 ID'
  })
});
export type ExportDatasetLimitQuery = z.infer<typeof ExportDatasetLimitQuerySchema>;

export const ExportDatasetLimitResponseSchema = z.undefined().meta({
  description: '检查通过，无业务数据返回'
});
export type ExportDatasetLimitResponse = z.infer<typeof ExportDatasetLimitResponseSchema>;

/* ============================================================================
 * API: 检查团队站点同步频率限制
 * Route: GET /api/support/user/team/limit/webSyncLimit
 * Method: GET
 * Description: 检查当前团队是否已超过站点同步冷却时间
 * Tags: ['限流检查', 'Read']
 * ============================================================================ */

export const WebSyncLimitQuerySchema = z.object({}).meta({
  description: '该接口不需要查询参数'
});
export type WebSyncLimitQuery = z.infer<typeof WebSyncLimitQuerySchema>;

export const WebSyncLimitResponseSchema = z.undefined().meta({
  description: '检查通过，无业务数据返回'
});
export type WebSyncLimitResponse = z.infer<typeof WebSyncLimitResponseSchema>;
