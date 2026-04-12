import { z } from 'zod';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import { TrainingModeEnum } from '../../../../core/dataset/constants';
import { DatasetTrainingSchema } from '../../../../core/dataset/type';
import { PaginationSchema, PaginationResponseSchema } from '../../../api';

/* ============================================================================
 * API: 更新训练数据（或重试所有错误数据）
 * Route: PUT /api/core/dataset/training/updateTrainingData
 * ============================================================================ */
export const UpdateTrainingDataBodySchema = z.object({
  datasetId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '知识库 ID'
  }),
  collectionId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a06',
    description: '集合 ID'
  }),
  dataId: ObjectIdSchema.optional().meta({
    example: '68ad85a7463006c963799a07',
    description: '训练数据 ID，不传则重试集合内所有错误数据'
  }),
  q: z.string().optional().meta({
    example: '什么是 FastGPT？',
    description: '问题/主文本'
  }),
  a: z.string().optional().meta({
    example: 'FastGPT 是一个 AI Agent 构建平台',
    description: '回答/补充文本'
  }),
  chunkIndex: z.int().min(0).optional().meta({
    example: 0,
    description: '块索引'
  })
});
export type UpdateTrainingDataBody = z.infer<typeof UpdateTrainingDataBodySchema>;

export const UpdateTrainingDataResponseSchema = z.object({});
export type UpdateTrainingDataResponse = z.infer<typeof UpdateTrainingDataResponseSchema>;

/* ============================================================================
 * API: 重建数据集向量索引
 * Route: POST /api/core/dataset/training/rebuildEmbedding
 * ============================================================================ */
export const RebuildEmbeddingBodySchema = z.object({
  datasetId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '知识库 ID'
  }),
  vectorModel: z.string().meta({
    example: 'text-embedding-3-small',
    description: '新的向量模型名称，不能与当前模型相同'
  })
});
export type RebuildEmbeddingBody = z.infer<typeof RebuildEmbeddingBodySchema>;

export const RebuildEmbeddingResponseSchema = z.object({});
export type RebuildEmbeddingResponse = z.infer<typeof RebuildEmbeddingResponseSchema>;

/* ============================================================================
 * API: 删除训练数据
 * Route: POST /api/core/dataset/training/deleteTrainingData
 * ============================================================================ */
export const DeleteTrainingDataBodySchema = z.object({
  datasetId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '知识库 ID'
  }),
  collectionId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a06',
    description: '集合 ID'
  }),
  dataId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a07',
    description: '训练数据 ID'
  })
});
export type DeleteTrainingDataBody = z.infer<typeof DeleteTrainingDataBodySchema>;

export const DeleteTrainingDataResponseSchema = z.object({});
export type DeleteTrainingDataResponse = z.infer<typeof DeleteTrainingDataResponseSchema>;

/* ============================================================================
 * API: 获取训练数据详情
 * Route: POST /api/core/dataset/training/getTrainingDataDetail
 * ============================================================================ */
export const GetTrainingDataDetailBodySchema = z.object({
  datasetId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '知识库 ID'
  }),
  collectionId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a06',
    description: '集合 ID'
  }),
  dataId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a07',
    description: '训练数据 ID'
  })
});
export type GetTrainingDataDetailBody = z.infer<typeof GetTrainingDataDetailBodySchema>;

export const GetTrainingDataDetailResponseSchema = z
  .object({
    _id: ObjectIdSchema.meta({
      example: '68ad85a7463006c963799a07',
      description: '训练数据 ID'
    }),
    datasetId: ObjectIdSchema.meta({
      example: '68ad85a7463006c963799a05',
      description: '知识库 ID'
    }),
    mode: z.enum(TrainingModeEnum).meta({
      example: TrainingModeEnum.chunk,
      description: '训练模式'
    }),
    q: z.string().optional().meta({
      example: '什么是 FastGPT？',
      description: '问题/主文本'
    }),
    a: z.string().optional().meta({
      example: 'FastGPT 是一个 AI Agent 构建平台',
      description: '回答/补充文本'
    }),
    imagePreviewUrl: z.string().optional().meta({
      example: 'https://example.com/image.png',
      description: '图片预览 URL（S3 签名链接，有效期30分钟）'
    })
  })
  .nullish()
  .meta({ description: '训练数据详情，数据不存在时为 null' });
export type GetTrainingDataDetailResponse = z.infer<typeof GetTrainingDataDetailResponseSchema>;

/* ============================================================================
 * API: 获取训练错误列表（分页）
 * Route: POST /api/core/dataset/training/getTrainingError
 * ============================================================================ */
export const GetTrainingErrorBodySchema = PaginationSchema.extend({
  collectionId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a06',
    description: '集合 ID'
  })
});
export type GetTrainingErrorBody = z.infer<typeof GetTrainingErrorBodySchema>;

export const GetTrainingErrorResponseSchema = PaginationResponseSchema(
  DatasetTrainingSchema.omit({ billId: true }).extend({
    billId: z.string().optional()
  })
);
export type GetTrainingErrorResponse = z.infer<typeof GetTrainingErrorResponseSchema>;

/* ============================================================================
 * API: 获取数据集训练队列状态
 * Route: GET /api/core/dataset/training/getDatasetTrainingQueue
 * ============================================================================ */
export const GetDatasetTrainingQueueQuerySchema = z.object({
  datasetId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '知识库 ID'
  })
});
export type GetDatasetTrainingQueueQuery = z.infer<typeof GetDatasetTrainingQueueQuerySchema>;

export const GetDatasetTrainingQueueResponseSchema = z.object({
  rebuildingCount: z.number().meta({
    example: 5,
    description: '正在重建向量的数据条数'
  }),
  trainingCount: z.number().meta({
    example: 12,
    description: '训练队列中的数据条数'
  })
});
export type GetDatasetTrainingQueueResponse = z.infer<typeof GetDatasetTrainingQueueResponseSchema>;
