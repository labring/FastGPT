import { ObjectIdSchema } from '../../../../common/type/mongo';
import { z } from 'zod';

/* ============================================================================
 * API: 申请知识库集合批量下载凭证
 * Route: POST /api/core/dataset/collection/getDownloadTicket
 * Method: POST
 * Description: 校验并准备通用知识库集合批量下载所需的短效一次性凭证
 * Tags: ['Dataset', 'Read']
 * ============================================================================ */

export const GetDownloadTicketDatasetCollectionsBodySchema = z.object({
  datasetId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '知识库 ID'
  }),
  collectionIds: z
    .array(ObjectIdSchema)
    .min(1)
    .meta({
      example: ['68ad85a7463006c963799a06'],
      description: '需要下载的集合 ID 列表'
    })
});
export type GetDownloadTicketDatasetCollectionsBodyType = z.infer<
  typeof GetDownloadTicketDatasetCollectionsBodySchema
>;

export const GetDownloadTicketDatasetCollectionsResponseSchema = z.object({
  ticket: z.string().min(1).meta({
    example: '01JZZ8B7M5Y7QJX9J7S5V7QJ4F',
    description: '短效一次性下载凭证'
  }),
  expiresAt: z.string().datetime().meta({
    example: '2026-09-22T10:00:00.000Z',
    description: '凭证过期时间'
  })
});
export type GetDownloadTicketDatasetCollectionsResponseType = z.infer<
  typeof GetDownloadTicketDatasetCollectionsResponseSchema
>;

/* ============================================================================
 * API: 下载知识库集合归档文件
 * Route: GET /api/core/dataset/collection/batchDownload
 * Method: GET
 * Description: 使用短效凭证将预检后的集合原始文件流式归档为 ZIP
 * Tags: ['Dataset', 'Read']
 * ============================================================================ */

export const BatchDownloadDatasetCollectionsQuerySchema = z.object({
  ticket: z.string().min(1).meta({
    example: '01JZZ8B7M5Y7QJX9J7S5V7QJ4F',
    description: '申请下载接口返回的短效一次性凭证'
  })
});
export type BatchDownloadDatasetCollectionsQueryType = z.infer<
  typeof BatchDownloadDatasetCollectionsQuerySchema
>;

export const BatchDownloadDatasetCollectionsResponseSchema = z.string().meta({
  format: 'binary',
  description: 'ZIP 归档文件流'
});
export type BatchDownloadDatasetCollectionsResponseType = z.infer<
  typeof BatchDownloadDatasetCollectionsResponseSchema
>;
