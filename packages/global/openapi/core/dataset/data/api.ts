import z from 'zod';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import {
  DatasetCollectionSchema,
  DatasetDataIndexItemSchema,
  DatasetDataItemSchema,
  UpdateDatasetDataPropsSchema
} from '../../../../core/dataset/type';
import { DatasetCollectionDataProcessModeEnum } from '../../../../core/dataset/constants';
import { OutLinkChatAuthSchema } from '../../../../support/permission/chat';
import { PaginationSchema, PaginationResponseSchema } from '../../../api';

const PushDataChunkSchema = z.object({
  q: z.string().optional().meta({
    example: '什么是 FastGPT？',
    description: '问题/主文本'
  }),
  a: z.string().optional().meta({
    description: '回答/补充文本'
  }),
  imageId: z.string().optional().meta({
    description: '图片 ID'
  }),
  chunkIndex: z.number().optional().meta({
    example: 0,
    description: '块索引'
  }),
  indexes: z
    .array(DatasetDataIndexItemSchema.omit({ dataId: true }))
    .optional()
    .meta({ description: '额外向量索引' })
});
export type PushDataChunkType = z.infer<typeof PushDataChunkSchema>;

/* ============================================================================
 * API: 获取数据集数据详情
 * Route: GET /api/core/dataset/data/detail
 * ============================================================================ */
export const GetDatasetDataDetailQuerySchema = z.object({
  id: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '数据 ID'
  })
});
export type GetDatasetDataDetailQuery = z.infer<typeof GetDatasetDataDetailQuerySchema>;

export const GetDatasetDataDetailResponseSchema = DatasetDataItemSchema;
export type GetDatasetDataDetailResponse = z.infer<typeof GetDatasetDataDetailResponseSchema>;

/* ============================================================================
 * API: 更新数据集数据
 * Route: PUT /api/core/dataset/data/update
 * ============================================================================ */
export const UpdateDatasetDataBodySchema = UpdateDatasetDataPropsSchema;
export type UpdateDatasetDataBody = z.infer<typeof UpdateDatasetDataBodySchema>;

/* ============================================================================
 * API: 删除数据集数据
 * Route: DELETE /api/core/dataset/data/delete
 * ============================================================================ */
export const DeleteDatasetDataQuerySchema = z.object({
  id: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '数据 ID'
  })
});
export type DeleteDatasetDataQuery = z.infer<typeof DeleteDatasetDataQuerySchema>;

/* ============================================================================
 * API: 获取引用数据
 * Route: POST /api/core/dataset/data/getQuoteData
 * ============================================================================ */
export const GetQuoteDataBodySchema = OutLinkChatAuthSchema.extend({
  id: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '数据 ID'
  }),
  // 对话模式下的额外字段（三者必须同时提供，否则走 API 模式）
  appId: ObjectIdSchema.optional().meta({
    example: '68ad85a7463006c963799a10',
    description: '应用 ID（对话模式必填）'
  }),
  chatId: z.string().optional().meta({
    example: '68ad85a7463006c963799a11',
    description: '对话 ID（对话模式必填）'
  }),
  chatItemDataId: z.string().optional().meta({
    example: '68ad85a7463006c963799a12',
    description: '对话条目数据 ID（对话模式必填）'
  })
}).refine(
  (d) =>
    (!!d.chatId && !!d.appId && !!d.chatItemDataId) || (!d.chatId && !d.appId && !d.chatItemDataId),
  { message: '对话模式下 appId / chatId / chatItemDataId 必须同时提供' }
);
export type GetQuoteDataBody = z.infer<typeof GetQuoteDataBodySchema>;

export const GetQuoteDataResponseSchema = z.object({
  q: z.string().meta({
    example: '什么是 FastGPT？',
    description: '问题/主文本'
  }),
  a: z.string().optional().meta({
    example: 'FastGPT 是一个 AI Agent 构建平台',
    description: '回答/补充文本'
  }),
  collection: DatasetCollectionSchema.meta({
    description: '所属集合信息'
  })
});
export type GetQuoteDataResponse = z.infer<typeof GetQuoteDataResponseSchema>;

/* ============================================================================
 * API: 插入单条数据
 * Route: POST /api/core/dataset/data/insertData
 * ============================================================================ */
export const InsertDataBodySchema = PushDataChunkSchema.omit({ q: true }).extend({
  q: z.string().nonempty().meta({
    example: '什么是 FastGPT？',
    description: '问题/主文本'
  }),
  collectionId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a06',
    description: '集合 ID'
  })
});
export type InsertDataBody = z.infer<typeof InsertDataBodySchema>;

export const InsertDataResponseSchema = ObjectIdSchema.meta({
  example: '68ad85a7463006c963799a07',
  description: '新插入的数据 ID'
});
export type InsertDataResponse = z.infer<typeof InsertDataResponseSchema>;

/* ============================================================================
 * API: 插入图片
 * Route: POST /api/core/dataset/data/insertImages (multipart/form-data)
 * ============================================================================ */
export const InsertImagesBodySchema = z.object({
  collectionId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a06',
    description: '集合 ID'
  }),
  file: z
    .array(z.any())
    .optional()
    .meta({
      description: '图片文件列表，multipart/form-data 上传，每个 item 为 binary 文件',
      items: { type: 'string', format: 'binary' }
    })
});
export type InsertImagesBody = z.infer<typeof InsertImagesBodySchema>;

export const InsertImagesResponseSchema = z.object({});
export type InsertImagesResponse = z.infer<typeof InsertImagesResponseSchema>;

/* ============================================================================
 * API: 推送数据到训练队列
 * Route: POST /api/core/dataset/data/pushData
 * ============================================================================ */
export const PushDataBodySchema = z.object({
  collectionId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a06',
    description: '集合 ID'
  }),
  data: z.array(PushDataChunkSchema).max(200).meta({
    description: '数据列表，最多 200 条'
  }),
  trainingType: z.enum(DatasetCollectionDataProcessModeEnum).optional().meta({
    description: '训练类型'
  }),
  indexSize: z.number().optional().meta({
    description: '索引大小限制'
  }),
  autoIndexes: z.boolean().optional().meta({
    description: '是否自动生成索引'
  }),
  imageIndex: z.boolean().optional().meta({
    description: '是否生成图片索引'
  }),
  prompt: z.string().optional().meta({
    description: '自定义提示词'
  }),
  billId: z.string().optional().meta({
    description: '账单 ID'
  }),

  trainingMode: z.enum(DatasetCollectionDataProcessModeEnum).optional().meta({
    description: '训练类型',
    deprecated: true
  })
});
export type PushDataBody = z.infer<typeof PushDataBodySchema>;

export const PushDataResponseSchema = z.object({
  insertLen: z.number().meta({
    example: 10,
    description: '成功插入的数据条数'
  })
});
export type PushDataResponseType = z.infer<typeof PushDataResponseSchema>;

/* ============================================================================
 * API: 获取数据列表 V2（推荐）
 * Route: POST /api/core/dataset/data/v2/list
 * ============================================================================ */
export const GetDataListItemSchema = z.object({
  _id: ObjectIdSchema.meta({ description: '数据 ID' }),
  datasetId: ObjectIdSchema.meta({ description: '数据集 ID' }),
  collectionId: ObjectIdSchema.meta({ description: '集合 ID' }),
  q: z.string().optional().meta({ description: '问题/主文本' }),
  a: z.string().optional().meta({ description: '回答/补充文本' }),
  imageId: z.string().optional().meta({ description: '图片 ID' }),
  imageSize: z.number().optional().meta({ description: '图片大小（字节）' }),
  imagePreviewUrl: z.string().optional().meta({ description: '图片预览 URL' }),
  chunkIndex: z.number().optional().meta({ description: '块索引' }),
  updated: z.boolean().optional().meta({ description: '是否已更新' })
});

export const GetDatasetDataListBodySchema = PaginationSchema.extend({
  collectionId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a06',
    description: '集合 ID'
  }),
  searchText: z.string().optional().meta({
    example: 'FastGPT',
    description: '搜索关键词，按 q/a 字段模糊匹配'
  })
});
export type GetDatasetDataListBody = z.infer<typeof GetDatasetDataListBodySchema>;

export const GetDatasetDataListResponseSchema = PaginationResponseSchema(GetDataListItemSchema);
export type GetDatasetDataListResponse = z.infer<typeof GetDatasetDataListResponseSchema>;

/* ============================================================================
 * API: 获取数据列表（已废弃，使用 v2/list）
 * Route: POST /api/core/dataset/data/list
 * @deprecated
 * ============================================================================ */
export const GetDatasetDataListLegacyBodySchema = PaginationSchema.extend({
  collectionId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a06',
    description: '集合 ID'
  }),
  searchText: z.string().optional().meta({
    example: 'FastGPT',
    description: '搜索关键词'
  })
});
export type GetDatasetDataListLegacyBody = z.infer<typeof GetDatasetDataListLegacyBodySchema>;
