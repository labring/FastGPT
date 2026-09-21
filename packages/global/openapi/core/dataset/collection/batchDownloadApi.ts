import { ObjectIdSchema } from '../../../../common/type/mongo';
import z from 'zod';

/* ============================================================================
 * API: 批量下载知识库集合原始文件
 * Route: POST /api/core/dataset/collection/batchDownload
 * Method: POST
 * Description: 将选中的通用知识库文件和文件夹流式归档为 ZIP
 * Tags: ['Dataset', 'Read']
 * ============================================================================ */

const CollectionIdsSchema = z.preprocess(
  (value) => (typeof value === 'string' ? [value] : value),
  z.array(ObjectIdSchema).min(1)
);

export const BatchDownloadDatasetCollectionsBodySchema = z.object({
  collectionIds: CollectionIdsSchema.meta({
    example: ['68ad85a7463006c963799a05'],
    description: '需要归档的集合 ID 列表；表单提交单个 ID 时也会规范化为数组'
  })
});
export type BatchDownloadDatasetCollectionsBodyType = z.infer<
  typeof BatchDownloadDatasetCollectionsBodySchema
>;

export const BatchDownloadDatasetCollectionsResponseSchema = z.string().meta({
  format: 'binary',
  description: 'ZIP 归档文件流'
});
export type BatchDownloadDatasetCollectionsResponseType = z.infer<
  typeof BatchDownloadDatasetCollectionsResponseSchema
>;
