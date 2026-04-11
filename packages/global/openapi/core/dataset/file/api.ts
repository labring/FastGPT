import { z } from 'zod';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import { DatasetSourceReadTypeEnum } from '../../../../core/dataset/constants';
import { ChunkSettingsSchema } from '../../../../core/dataset/type';
import { CreatePostPresignedUrlResultSchema } from '../../../../../service/common/s3/type';

/* ============================================================================
 * API: 预览文件分块
 * Route: POST /api/core/dataset/file/getPreviewChunks
 * ============================================================================ */
export const GetPreviewChunksBodySchema = ChunkSettingsSchema.extend({
  datasetId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '知识库 ID'
  }),
  type: z.enum(DatasetSourceReadTypeEnum).meta({
    example: DatasetSourceReadTypeEnum.fileLocal,
    description: '数据源读取类型'
  }),
  sourceId: z.string().meta({
    example: '68ad85a7463006c963799a05',
    description: '数据源 ID（文件 ID / 链接 / 外部文件 / API 文件等）'
  }),
  customPdfParse: z.boolean().optional().meta({
    description: '是否启用自定义 PDF 解析'
  }),
  overlapRatio: z.number().meta({
    example: 0.2,
    description: '分块重叠比例'
  }),
  selector: z.string().optional().meta({
    example: 'body',
    description: '网页抓取的 CSS 选择器'
  }),
  externalFileId: z.string().optional().meta({
    description: '外部文件标识'
  })
});
export type GetPreviewChunksBody = z.infer<typeof GetPreviewChunksBodySchema>;

const PreviewChunkItemSchema = z.object({
  q: z.string().meta({ description: '主要文本' }),
  a: z.string().meta({ description: '辅助文本' })
});

export const GetPreviewChunksResponseSchema = z.object({
  chunks: z.array(PreviewChunkItemSchema).meta({
    description: '预览分块列表（最多 10 条）'
  }),
  total: z.number().meta({
    example: 42,
    description: '分块总数'
  })
});
export type GetPreviewChunksResponse = z.infer<typeof GetPreviewChunksResponseSchema>;

/* ============================================================================
 * API: 获取知识库文件上传预签名 URL
 * Route: POST /api/core/dataset/file/presignDatasetFilePostUrl
 * ============================================================================ */
export const PresignDatasetFilePostUrlBodySchema = z.object({
  filename: z.string().min(1).meta({
    example: '产品文档.pdf',
    description: '待上传的文件名，不能为空'
  }),
  datasetId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '目标知识库 ID'
  })
});
export type PresignDatasetFilePostUrlBody = z.infer<typeof PresignDatasetFilePostUrlBodySchema>;

export const PresignDatasetFilePostUrlResponseSchema = CreatePostPresignedUrlResultSchema.meta({
  description: 'S3 预签名上传 URL 及相关头信息'
});
export type PresignDatasetFilePostUrlResponse = z.infer<
  typeof PresignDatasetFilePostUrlResponseSchema
>;
