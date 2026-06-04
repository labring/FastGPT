import { z } from 'zod';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import { DatasetCollectionTypeEnum, TrainingModeEnum } from '../../../../core/dataset/constants';
import { DatasetTrainingSchema } from '../../../../core/dataset/type';
import { PaginationSchema, PaginationResponseSchema } from '../../../api';

/* ============================================================================
 * API: 更新训练数据（或重试所有错误数据）
 * Route: PUT /api/core/dataset/training/updateTrainingData
 * ============================================================================ */
export const UpdateTrainingDataBodySchema = z
  .object({
    datasetId: ObjectIdSchema.optional().meta({
      example: '68ad85a7463006c963799a05',
      description: '知识库 ID，不传 dataId 时按知识库范围重试所有最终/阻塞异常'
    }),
    collectionId: ObjectIdSchema.optional().meta({
      example: '68ad85a7463006c963799a06',
      description: '集合 ID，不传 dataId 时按集合范围重试所有最终/阻塞异常'
    }),
    dataId: ObjectIdSchema.optional().meta({
      example: '68ad85a7463006c963799a07',
      description: '训练数据 ID，传入则只重试或更新该训练数据'
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
  })
  .superRefine((data, ctx) => {
    if (!data.collectionId && !data.datasetId && !data.dataId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['collectionId'],
        message: 'collectionId, datasetId or dataId is required'
      });
    }

    if (!data.dataId && data.collectionId && data.datasetId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['collectionId'],
        message: 'collectionId and datasetId cannot be used together without dataId'
      });
    }
  });
export type UpdateTrainingDataBody = z.infer<typeof UpdateTrainingDataBodySchema>;

export const UpdateTrainingDataResponseSchema = z.undefined().meta({ description: '更新成功' });
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

export const RebuildEmbeddingResponseSchema = z.undefined().meta({ description: '重建成功' });
export type RebuildEmbeddingResponse = z.infer<typeof RebuildEmbeddingResponseSchema>;

/* ============================================================================
 * API: 删除训练数据
 * Route: POST /api/core/dataset/training/deleteTrainingData
 * ============================================================================ */
export const DeleteTrainingDataBodySchema = z.object({
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

export const DeleteTrainingDataResponseSchema = z.undefined().meta({ description: '删除成功' });
export type DeleteTrainingDataResponse = z.infer<typeof DeleteTrainingDataResponseSchema>;

/* ============================================================================
 * API: 获取训练数据详情
 * Route: POST /api/core/dataset/training/getTrainingDataDetail
 * ============================================================================ */
export const GetTrainingDataDetailBodySchema = z.object({
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
    collectionId: ObjectIdSchema.meta({
      example: '68ad85a7463006c963799a06',
      description: '集合 ID'
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

export const TrainingErrorItemSchema = DatasetTrainingSchema.omit({ billId: true }).extend({
  billId: z.string().optional()
});
export type TrainingErrorItemType = z.infer<typeof TrainingErrorItemSchema>;

export const TrainingErrorCollectionSchema = z.object({
  _id: ObjectIdSchema.meta({ description: '集合 ID' }),
  collectionId: ObjectIdSchema.meta({ description: '集合 ID' }),
  name: z.string().meta({ description: '集合名称' }),
  type: z.enum(DatasetCollectionTypeEnum).meta({ description: '集合类型' }),
  sourceName: z.string().optional().meta({ description: '来源名称' }),
  sourceId: z.string().optional().meta({ description: '来源 ID' })
});
export type TrainingErrorCollectionType = z.infer<typeof TrainingErrorCollectionSchema>;

export const TrainingErrorGroupSchema = z.object({
  collection: TrainingErrorCollectionSchema.meta({ description: '集合信息' }),
  items: z.array(TrainingErrorItemSchema).meta({ description: '异常训练记录列表' }),
  errorCount: z.number().meta({
    description: '该集合最终/阻塞异常总数'
  }),
  hasMoreItems: z.boolean().meta({
    description: '该集合是否还有更多异常项未返回'
  })
});
export type TrainingErrorGroupType = z.infer<typeof TrainingErrorGroupSchema>;

export const GetTrainingErrorResponseSchema = PaginationResponseSchema(TrainingErrorItemSchema);
export type GetTrainingErrorResponse = z.infer<typeof GetTrainingErrorResponseSchema>;

export const DatasetTrainingErrorPaginationLimits = {
  maxPageSize: 20,
  maxOffset: 100000,
  maxPageNum: 5000,
  defaultItemPageSize: 5,
  maxItemOffset: 100000,
  maxItemPageSize: 20
} as const;

/* ============================================================================
 * API: 获取知识库训练错误列表（分页）
 * Route: POST /api/core/dataset/training/getDatasetTrainingError
 * ============================================================================ */
export const GetDatasetTrainingErrorBodySchema = PaginationSchema.extend({
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(DatasetTrainingErrorPaginationLimits.maxPageSize)
    .optional()
    .meta({
      example: 10,
      description: `每页集合数量，范围 [1, ${DatasetTrainingErrorPaginationLimits.maxPageSize}]`
    }),
  offset: z.coerce
    .number()
    .int()
    .min(0)
    .max(DatasetTrainingErrorPaginationLimits.maxOffset)
    .optional()
    .meta({
      example: 0,
      description: `集合分页偏移量，范围 [0, ${DatasetTrainingErrorPaginationLimits.maxOffset}]`
    }),
  pageNum: z.coerce
    .number()
    .int()
    .min(1)
    .max(DatasetTrainingErrorPaginationLimits.maxPageNum)
    .optional()
    .meta({
      example: 1,
      description: `集合分页页码，范围 [1, ${DatasetTrainingErrorPaginationLimits.maxPageNum}]`
    }),
  datasetId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '知识库 ID'
  }),
  collectionId: ObjectIdSchema.optional().meta({
    example: '68ad85a7463006c963799a06',
    description: '集合 ID。传入时只分页加载该集合内的异常 chunk'
  }),
  itemOffset: z.coerce
    .number()
    .int()
    .min(0)
    .max(DatasetTrainingErrorPaginationLimits.maxItemOffset)
    .optional()
    .meta({
      example: 5,
      description: `集合内异常 chunk 偏移量，用于加载更多，范围 [0, ${DatasetTrainingErrorPaginationLimits.maxItemOffset}]`
    }),
  itemPageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(DatasetTrainingErrorPaginationLimits.maxItemPageSize)
    .optional()
    .meta({
      example: DatasetTrainingErrorPaginationLimits.defaultItemPageSize,
      description: `每个集合返回的异常 chunk 数量，范围 [1, ${DatasetTrainingErrorPaginationLimits.maxItemPageSize}]`
    })
});
export type GetDatasetTrainingErrorBody = z.infer<typeof GetDatasetTrainingErrorBodySchema>;

export const GetDatasetTrainingErrorResponseSchema =
  PaginationResponseSchema(TrainingErrorGroupSchema);
export type GetDatasetTrainingErrorResponse = z.infer<typeof GetDatasetTrainingErrorResponseSchema>;

/* ============================================================================
 * API: 检查知识库是否存在训练错误
 * Route: GET /api/core/dataset/training/hasDatasetTrainingError
 * ============================================================================ */
export const HasDatasetTrainingErrorQuerySchema = z.object({
  datasetId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '知识库 ID'
  })
});
export type HasDatasetTrainingErrorQuery = z.infer<typeof HasDatasetTrainingErrorQuerySchema>;

export const HasDatasetTrainingErrorResponseSchema = z.object({
  hasError: z.boolean().meta({
    example: true,
    description: '知识库内是否存在最终/阻塞异常训练记录'
  })
});
export type HasDatasetTrainingErrorResponse = z.infer<typeof HasDatasetTrainingErrorResponseSchema>;

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
