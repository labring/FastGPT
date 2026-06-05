import z from 'zod';
import { ObjectIdSchema } from '../../../../common/type/mongo';

/* ============================================================================
 * API: 查询同义词文件列表
 * Route: GET /api/core/dataset/synonym/list
 * ============================================================================ */
export const GetSynonymListQuerySchema = z.object({
  datasetId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '知识库 ID'
  })
});
export type GetSynonymListQuery = z.infer<typeof GetSynonymListQuerySchema>;

export const SynonymFileItemSchema = z.object({
  _id: z.string().meta({ example: '68ad85a7463006c963799a05', description: '同义词文件 ID' }),
  filename: z.string().meta({ example: 'synonyms.csv', description: '文件名' }),
  fileSize: z.number().meta({ example: 1024, description: '文件大小（字节）' }),
  uploadTime: z.string().meta({ example: '2024-01-01T00:00:00.000Z', description: '上传时间' }),
  uploaderName: z.string().optional().meta({ description: '上传者名称' }),
  status: z
    .enum(['active', 'inactive'])
    .meta({ example: 'active', description: '状态：active=有效, inactive=已失效' })
});

export const GetSynonymListResponseSchema = z.object({
  list: z.array(SynonymFileItemSchema).meta({ description: '同义词文件列表（按上传时间倒序）' })
});
export type GetSynonymListResponse = z.infer<typeof GetSynonymListResponseSchema>;

/* ============================================================================
 * API: 下载同义词文件
 * Route: GET /api/core/dataset/synonym/download
 * ============================================================================ */
export const DownloadSynonymQuerySchema = z.object({
  id: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '同义词文件 ID'
  })
});
export type DownloadSynonymQuery = z.infer<typeof DownloadSynonymQuerySchema>;

/* ============================================================================
 * API: 删除同义词文件
 * Route: DELETE /api/core/dataset/synonym/delete
 * ============================================================================ */
export const DeleteSynonymQuerySchema = z.object({
  id: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '同义词文件 ID'
  })
});
export type DeleteSynonymQuery = z.infer<typeof DeleteSynonymQuerySchema>;

/* ============================================================================
 * API: 上传同义词文件
 * Route: POST /api/core/dataset/synonym/upload
 * ============================================================================ */
export const UploadSynonymBodySchema = z.object({
  datasetId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '知识库 ID'
  })
});
export type UploadSynonymBody = z.infer<typeof UploadSynonymBodySchema>;
