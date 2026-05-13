import { z } from 'zod';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import { DatasetSourceReadTypeEnum } from '../../../../core/dataset/constants';
import { ChunkSettingsSchema } from '../../../../core/dataset/type';
import { CreatePostPresignedUrlResponseSchema } from '../../../../common/file/s3/type';

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
  sourceId: z.string().nonempty().meta({
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

export const PresignDatasetFilePostUrlResponseSchema = CreatePostPresignedUrlResponseSchema.meta({
  description: 'S3 预签名上传 URL 及相关头信息'
});
export type PresignDatasetFilePostUrlResponse = z.infer<
  typeof PresignDatasetFilePostUrlResponseSchema
>;

/* ============================================================================
 * API: 获取搜索测试图片上传预签名 URL
 * Route: POST /api/core/dataset/file/presignSearchTestImage
 * Method: POST
 * Description: 获取用于知识库搜索测试图片上传的临时预签名 URL，上传对象 3 小时后过期
 * Tags: ['Dataset', 'File', 'Write']
 * ============================================================================ */
export const PresignSearchTestImageBodySchema = z.object({
  datasetId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '知识库 ID'
  }),
  filename: z.string().min(1).meta({
    example: 'demo.png',
    description: '待上传图片文件名'
  })
});
export type PresignSearchTestImageBody = z.infer<typeof PresignSearchTestImageBodySchema>;

export const PresignSearchTestImageResponseSchema = CreatePostPresignedUrlResponseSchema.meta({
  description: '搜索测试图片上传预签名 URL、临时 key 和预览 URL'
});
export type PresignSearchTestImageResponse = z.infer<typeof PresignSearchTestImageResponseSchema>;

/* ============================================================================
 * API: 获取搜索测试图片预览 URL
 * Route: POST /api/core/dataset/file/getSearchTestImagePreviewUrls
 * Method: POST
 * Description: 根据搜索测试历史中的临时图片 key 重新生成短期预览 URL
 * Tags: ['Dataset', 'File', 'Read']
 * ============================================================================ */
export const GetSearchTestImagePreviewUrlsBodySchema = z.object({
  datasetId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '知识库 ID'
  }),
  keys: z
    .array(z.string().min(1))
    .max(10)
    .meta({
      example: ['temp/teamId/demo.png'],
      description: '搜索测试图片临时 S3 key 列表，最多 10 个'
    })
});
export type GetSearchTestImagePreviewUrlsBody = z.infer<
  typeof GetSearchTestImagePreviewUrlsBodySchema
>;

export const GetSearchTestImagePreviewUrlsResponseSchema = z.array(
  z.object({
    key: z.string().meta({
      example: 'temp/teamId/demo.png',
      description: '临时图片 S3 key'
    }),
    previewUrl: z.string().meta({
      description: '用于前端缩略图展示的临时预览 URL'
    })
  })
);
export type GetSearchTestImagePreviewUrlsResponse = z.infer<
  typeof GetSearchTestImagePreviewUrlsResponseSchema
>;
