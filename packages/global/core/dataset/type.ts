import { EmbeddingModelItemSchema, LLMModelItemSchema } from '../ai/model.schema';
import {
  DataChunkSplitModeEnum,
  DatasetCollectionDataProcessModeEnum,
  DatasetCollectionTypeEnum,
  DatasetStatusEnum,
  DatasetTypeEnum,
  SearchScoreTypeEnum,
  TrainingModeEnum,
  ChunkSettingModeEnum,
  ChunkTriggerConfigTypeEnum,
  ParagraphChunkAIModeEnum
} from './constants';
import {
  ApiDatasetServerSchema,
  APIFileServerSchema,
  DingtalkServerSchema,
  FeishuServerSchema,
  YuqueServerSchema
} from './apiDataset/type';
import { SourceMemberSchema } from '../../support/user/type';
import { DatasetDataIndexTypeEnum } from './data/constants';
import { ParentIdSchema } from '../../common/parentFolder/type';
import z from 'zod';
import { ObjectIdSchema } from '../../common/type/mongo';
import { PermissionSchema } from '../../support/permission/controller';

/* ===== Chunk ===== */
export const ChunkSettingsSchema = z.object({
  trainingType: z
    .enum(DatasetCollectionDataProcessModeEnum)
    .optional()
    .meta({ description: '训练类型' }),

  chunkTriggerType: z
    .enum(ChunkTriggerConfigTypeEnum)
    .optional()
    .meta({ description: '分块触发时机' }),
  chunkTriggerMinSize: z.number().optional().meta({ description: '分块触发最小大小' }),

  dataEnhanceCollectionName: z.boolean().optional().meta({ description: '增加集合名到分块里' }),
  imageIndex: z.boolean().optional().meta({ description: '图片索引' }),
  autoIndexes: z.boolean().optional().meta({ description: '自动生成索引' }),
  indexPrefixTitle: z.boolean().optional().meta({ description: '索引前缀标题' }),

  chunkSettingMode: z
    .enum(ChunkSettingModeEnum)
    .optional()
    .meta({ description: '系统参数/自定义参数' }),
  chunkSplitMode: z.enum(DataChunkSplitModeEnum).optional().meta({ description: '分块拆分模式' }),
  paragraphChunkAIMode: z
    .enum(ParagraphChunkAIModeEnum)
    .optional()
    .meta({ description: '段落分块 AI 模式' }),
  paragraphChunkDeep: z.number().optional().meta({ description: '段落分块深度' }),
  paragraphChunkMinSize: z.number().optional().meta({ description: '段落分块最小大小' }),
  chunkSize: z.number().optional().meta({ description: '分块大小' }),
  chunkSplitter: z.string().optional().meta({ description: '自定义最高优先分割符号' }),
  indexSize: z.number().optional().meta({ description: '索引大小' }),
  qaPrompt: z.string().optional().meta({ description: 'QA 拆分提示词' })
});
export type ChunkSettingsType = z.infer<typeof ChunkSettingsSchema>;

/* ===== Dataset ===== */
export const DatasetSchema = z
  .object({
    _id: ObjectIdSchema.meta({ description: '数据集 ID' }),
    parentId: ParentIdSchema.meta({ description: '父级 ID' }),
    userId: ObjectIdSchema.optional().meta({ description: '用户 ID', deprecated: true }),
    teamId: ObjectIdSchema.meta({ description: '团队 ID' }),
    tmbId: ObjectIdSchema.meta({ description: '团队成员 ID' }),
    updateTime: z.coerce.date().meta({ description: '更新时间' }),
    inheritPermission: z.boolean().meta({ description: '继承权限' }),

    avatar: z.string().meta({ description: '头像' }),
    name: z.string().meta({ description: '名称' }),
    intro: z.string().meta({ description: '简介' }),
    type: z.enum(DatasetTypeEnum).meta({ description: '数据集类型' }),

    vectorModel: z.string().meta({ description: '向量模型' }),
    agentModel: z.string().meta({ description: 'AI 模型' }),
    vlmModel: z.string().optional().meta({ description: '视觉语言模型' }),

    websiteConfig: z
      .object({
        url: z.string().meta({ description: '网站 URL' }),
        selector: z.string().meta({ description: '网站选择器' })
      })
      .optional()
      .meta({ description: '网站配置' }),
    chunkSettings: ChunkSettingsSchema.optional().meta({ description: '分块配置' }),

    apiDatasetServer: ApiDatasetServerSchema.optional().meta({ description: 'API 服务器配置' }),

    deleteTime: z.coerce.date().nullish().meta({ description: '删除时间' }),

    autoSync: z.boolean().optional().meta({ description: '自动同步', deprecated: true }),
    externalReadUrl: z.string().optional().meta({ description: '外部读取 URL', deprecated: true }),
    defaultPermission: z.number().optional().meta({ description: '默认权限', deprecated: true }),
    apiServer: APIFileServerSchema.optional().meta({
      description: 'API 服务器配置',
      deprecated: true
    }),
    feishuServer: FeishuServerSchema.optional().meta({
      description: '飞书服务器配置',
      deprecated: true
    }),
    yuqueServer: YuqueServerSchema.optional().meta({
      description: '语雀服务器配置',
      deprecated: true
    }),
    dingtalkServer: DingtalkServerSchema.optional().meta({
      description: '钉钉知识库配置',
      deprecated: true
    })
  })
  .meta({ description: '知识库' });
export type DatasetSchemaType = z.infer<typeof DatasetSchema>;

/* ===== Collection ===== */
export const DatasetCollectionSchema = ChunkSettingsSchema.omit({
  trainingType: true
}).extend({
  _id: ObjectIdSchema.meta({ description: '集合 ID' }),
  teamId: ObjectIdSchema.meta({ description: '团队 ID' }),
  tmbId: ObjectIdSchema.meta({ description: '团队成员 ID' }),
  datasetId: ObjectIdSchema.meta({ description: '数据集 ID' }),
  parentId: ParentIdSchema.meta({ description: '父级 ID' }),
  name: z.string().meta({ description: '名称' }),
  type: z.enum(DatasetCollectionTypeEnum).meta({ description: '集合类型' }),
  tags: z.array(z.string()).optional().meta({ description: '标签' }),

  createTime: z.coerce.date().meta({ description: '创建时间' }),
  updateTime: z.coerce.date().meta({ description: '更新时间' }),

  forbid: z.boolean().optional().meta({ description: '是否禁用' }),

  fileId: z.string().optional().meta({ description: '文件 ID' }),
  rawLink: z.string().optional().meta({ description: '原始链接' }),
  externalFileId: z.string().optional().meta({ description: '外部文件 ID' }),
  apiFileId: z.string().optional().meta({ description: 'API 文件 ID' }),
  apiFileParentId: z.string().optional().meta({ description: 'API 文件父级 ID' }),
  externalFileUrl: z.string().optional().meta({ description: '外部文件 URL' }),

  rawTextLength: z.number().optional().meta({ description: '原始文本长度' }),
  hashRawText: z.string().optional().meta({ description: '文本哈希' }),

  metadata: z.record(z.string(), z.any()).optional().meta({ description: '其他元数据' }),

  customPdfParse: z.boolean().optional().meta({ description: '自定义 PDF 解析' }),
  trainingType: z
    .enum(DatasetCollectionDataProcessModeEnum)
    .optional()
    .meta({ description: '训练类型' })
});
export type DatasetCollectionSchemaType = z.infer<typeof DatasetCollectionSchema>;

export const DatasetCollectionTagsSchema = z.object({
  _id: ObjectIdSchema.meta({ description: '标签 ID' }),
  teamId: ObjectIdSchema.meta({ description: '团队 ID' }),
  datasetId: ObjectIdSchema.meta({ description: '数据集 ID' }),
  tag: z.string().meta({ description: '标签' })
});
export type DatasetCollectionTagsSchemaType = z.infer<typeof DatasetCollectionTagsSchema>;

/* ===== Data ===== */
export const DatasetDataIndexItemSchema = z.object({
  type: z
    .enum(DatasetDataIndexTypeEnum)
    .optional()
    .default(DatasetDataIndexTypeEnum.custom)
    .meta({ description: '索引类型' }),
  dataId: z.string().meta({ description: 'vectorDB ID' }),
  text: z.string().meta({ description: '索引文本' })
});
const DatasetDataIndexOptionalSchema = DatasetDataIndexItemSchema.omit({ dataId: true }).extend({
  dataId: z.string().optional().meta({
    example: '68ad85a7463006c963799a05',
    description: 'PG 数据 ID（可选）'
  })
});
export type DatasetDataIndexItemType = z.infer<typeof DatasetDataIndexItemSchema>;

export const DatasetDataFieldSchema = z.object({
  q: z.string().meta({ description: '问题/主文本' }),
  a: z.string().optional().meta({ description: '回答/补充文本' }),
  imageId: z.string().optional().meta({ description: '图片 ID' })
});
export type DatasetDataFieldType = z.infer<typeof DatasetDataFieldSchema>;

export const DatasetDataHistorySchema = DatasetDataFieldSchema.extend({
  updateTime: z.coerce.date().meta({ description: '更新时间' })
});
export type DatasetDataHistoryType = z.infer<typeof DatasetDataHistorySchema>;

export const DatasetDataSchema = DatasetDataFieldSchema.extend({
  _id: ObjectIdSchema.meta({ description: '数据 ID' }),
  userId: ObjectIdSchema.optional().meta({ description: '用户 ID', deprecated: true }),
  teamId: ObjectIdSchema.meta({ description: '团队 ID' }),
  tmbId: ObjectIdSchema.meta({ description: '团队成员 ID' }),
  datasetId: ObjectIdSchema.meta({ description: '数据集 ID' }),
  collectionId: ObjectIdSchema.meta({ description: '集合 ID' }),
  chunkIndex: z.int().min(0).meta({ description: '块索引' }),
  updateTime: z.coerce.date().meta({ description: '更新时间' }),
  history: z.array(DatasetDataHistorySchema).optional().meta({ description: '历史版本' }),
  forbid: z.boolean().optional().meta({ description: '是否禁用' }),
  fullTextToken: z.string().meta({ description: '全文 token' }),
  indexes: z.array(DatasetDataIndexItemSchema).meta({ description: '向量索引' }),
  rebuilding: z.boolean().optional().meta({ description: '重建中' }),
  imageDescMap: z.record(z.string(), z.string()).optional().meta({ description: '图片描述映射' })
});
export type DatasetDataSchemaType = z.infer<typeof DatasetDataSchema>;

export const DatasetDataTextSchema = z.object({
  _id: ObjectIdSchema.meta({ description: '数据文本 ID' }),
  teamId: ObjectIdSchema.meta({ description: '团队 ID' }),
  datasetId: ObjectIdSchema.meta({ description: '数据集 ID' }),
  collectionId: ObjectIdSchema.meta({ description: '集合 ID' }),
  dataId: ObjectIdSchema.meta({ description: '数据 ID' }),
  fullTextToken: z.string().meta({ description: '全文 token' })
});
export type DatasetDataTextSchemaType = z.infer<typeof DatasetDataTextSchema>;

/* ===== Training ===== */
export const DatasetTrainingSchema = z.object({
  _id: ObjectIdSchema.meta({ description: '训练 ID' }),
  teamId: ObjectIdSchema.meta({ description: '团队 ID' }),
  tmbId: ObjectIdSchema.meta({ description: '团队成员 ID' }),
  datasetId: ObjectIdSchema.meta({ description: '数据集 ID' }),
  collectionId: ObjectIdSchema.meta({ description: '集合 ID' }),
  billId: z.string().meta({ description: '账单 ID' }),
  expireAt: z.coerce.date().meta({ description: '过期时间' }),
  lockTime: z.coerce.date().meta({ description: '锁定时间' }),
  mode: z.enum(TrainingModeEnum).meta({ description: '训练模式' }),
  dataId: z.string().optional().meta({ description: '数据 ID' }),
  q: z.string().meta({ description: '问题/主文本' }),
  a: z.string().meta({ description: '回答/补充文本' }),
  imageId: z.string().optional().meta({ description: '图片 ID' }),
  imageDescMap: z.record(z.string(), z.string()).optional().meta({ description: '图片描述映射' }),
  chunkIndex: z.number().meta({ description: '块索引' }),
  indexSize: z.number().optional().meta({ description: '索引大小' }),
  weight: z.number().meta({ description: '权重' }),
  indexes: z
    .array(DatasetDataIndexItemSchema.omit({ dataId: true }))
    .meta({ description: '向量索引' }),
  retryCount: z.number().meta({ description: '重试次数' }),
  errorMsg: z.string().optional().meta({ description: '错误信息' }),

  userId: ObjectIdSchema.optional().meta({ description: '用户 ID', deprecated: true })
});
export type DatasetTrainingSchemaType = z.infer<typeof DatasetTrainingSchema>;

export const CollectionWithDatasetSchema = DatasetCollectionSchema.extend({
  dataset: DatasetSchema
});
export type CollectionWithDatasetType = z.infer<typeof CollectionWithDatasetSchema>;

/* ====== service type ===== */

/* ================= dataset ===================== */
export const DatasetSimpleItemSchema = z.object({
  _id: ObjectIdSchema.meta({ description: '数据集 ID' }),
  avatar: z.string().meta({ description: '头像' }),
  name: z.string().meta({ description: '名称' }),
  vectorModel: EmbeddingModelItemSchema.meta({ description: '向量模型' })
});
export type DatasetSimpleItemType = z.infer<typeof DatasetSimpleItemSchema>;
export const DatasetListItemSchema = z.object({
  _id: ObjectIdSchema.meta({ description: '数据集 ID' }),
  tmbId: ObjectIdSchema.meta({ description: '团队成员 ID' }),
  avatar: z.string().meta({ description: '头像' }),
  updateTime: z.coerce.date().meta({ description: '更新时间' }),
  name: z.string().meta({ description: '名称' }),
  intro: z.string().meta({ description: '简介' }),
  type: z.enum(DatasetTypeEnum).meta({ description: '数据集类型' }),
  permission: PermissionSchema,
  vectorModel: EmbeddingModelItemSchema.meta({ description: '向量模型' }),
  inheritPermission: z.boolean().meta({ description: '继承权限' }),
  private: z.boolean().optional().meta({ description: '是否私有' }),
  sourceMember: SourceMemberSchema.optional().meta({ description: '来源成员' })
});
export type DatasetListItemType = z.infer<typeof DatasetListItemSchema>;

export const DatasetItemSchema = DatasetSchema.omit({
  vectorModel: true,
  agentModel: true,
  vlmModel: true
}).extend({
  status: z.enum(DatasetStatusEnum).meta({ description: '状态' }),
  errorMsg: z.string().optional().meta({ description: '错误信息' }),
  vectorModel: EmbeddingModelItemSchema.meta({ description: '向量模型' }),
  agentModel: LLMModelItemSchema.meta({ description: 'AI 模型' }),
  vlmModel: LLMModelItemSchema.optional().meta({ description: '视觉语言模型' }),
  permission: PermissionSchema
});
export type DatasetItemType = z.infer<typeof DatasetItemSchema>;

/* ================= tag ===================== */
export const DatasetTagSchema = z.object({
  _id: ObjectIdSchema.meta({ description: '标签 ID' }),
  tag: z.string().meta({ description: '标签' })
});
export type DatasetTagType = z.infer<typeof DatasetTagSchema>;

export const TagUsageSchema = z.object({
  tagId: z.string().meta({ description: '标签 ID' }),
  collections: z.array(z.string()).meta({ description: '集合 ID' })
});
export type TagUsageType = z.infer<typeof TagUsageSchema>;

/* ================= collection ===================== */
export const DatasetCollectionItemSchema = CollectionWithDatasetSchema.extend({
  sourceName: z.string().meta({ description: '来源名称' }),
  sourceId: z.string().optional().meta({ description: '来源 ID' }),
  file: z
    .object({
      filename: z.string().optional().meta({ description: '文件名' }),
      contentLength: z.number().optional().meta({ description: '文件长度' })
    })
    .optional()
    .meta({ description: '文件信息' }),
  permission: PermissionSchema,
  indexAmount: z.number().meta({ description: '索引数量' }),
  errorCount: z.number().optional().meta({ description: '错误数量' })
});
export type DatasetCollectionItemType = z.infer<typeof DatasetCollectionItemSchema>;

/* ================= data ===================== */
export const DatasetDataItemSchema = DatasetDataFieldSchema.extend({
  id: ObjectIdSchema.meta({ description: '数据 ID' }),
  teamId: ObjectIdSchema.meta({ description: '团队 ID' }),
  datasetId: ObjectIdSchema.meta({ description: '数据集 ID' }),
  collectionId: ObjectIdSchema.meta({ description: '集合 ID' }),
  imagePreivewUrl: z.string().optional().meta({ description: '图片预览 URL' }),
  updateTime: z.coerce.date().meta({ description: '更新时间' }),
  sourceName: z.string().meta({ description: '来源名称' }),
  sourceId: z.string().optional().meta({ description: '来源 ID' }),
  chunkIndex: z.number().meta({ description: '块索引' }),
  indexes: z.array(DatasetDataIndexItemSchema).meta({ description: '向量索引' }),
  isOwner: z.boolean().meta({ description: '是否为 owner' })
});
export type DatasetDataItemType = z.infer<typeof DatasetDataItemSchema>;

// Update dataset data
export const UpdateDatasetDataPropsSchema = z.object({
  dataId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '数据 ID'
  }),
  q: z.string().meta({
    example: '什么是 FastGPT？',
    description: '问题/主文本'
  }),
  a: z.string().optional().meta({
    example: 'FastGPT 是一个 AI Agent 构建平台',
    description: '回答/补充文本'
  }),
  indexes: z.array(DatasetDataIndexOptionalSchema).optional().meta({
    description: '向量索引列表'
  }),
  imageId: z.string().optional().meta({
    description: '图片 ID'
  }),
  indexPrefix: z.string().optional().meta({
    description: '索引前缀标题'
  })
});
export type UpdateDatasetDataPropsType = z.infer<typeof UpdateDatasetDataPropsSchema>;

// Create dataset data
export const CreateDatasetDataPropsSchema = z.object({
  teamId: ObjectIdSchema.meta({ description: '团队 ID' }),
  tmbId: ObjectIdSchema.meta({ description: '团队成员 ID' }),
  datasetId: ObjectIdSchema.meta({ description: '数据集 ID' }),
  collectionId: ObjectIdSchema.meta({ description: '集合 ID' }),
  chunkIndex: z.int().min(0).optional().meta({ description: '块索引' }),
  q: z.string().meta({ description: '问题/主文本' }),
  a: z.string().optional().meta({ description: '回答/补充文本' }),
  imageId: z.string().optional().meta({ description: '图片 ID' }),
  indexes: z
    .array(DatasetDataIndexItemSchema.omit({ dataId: true }))
    .optional()
    .meta({ description: '向量索引列表' }),
  indexPrefix: z.string().optional().meta({ description: '索引前缀标题' })
});
export type CreateDatasetDataPropsType = z.infer<typeof CreateDatasetDataPropsSchema>;

/* --------------- file ---------------------- */
export const DatasetFileSchema = z.object({
  _id: ObjectIdSchema.meta({ description: '文件 ID' }),
  length: z.number().meta({ description: '文件长度' }),
  chunkSize: z.number().meta({ description: '块大小' }),
  uploadDate: z.coerce.date().meta({ description: '上传时间' }),
  filename: z.string().meta({ description: '文件名' }),
  contentType: z.string().meta({ description: '文件类型' }),
  metadata: z
    .object({
      teamId: ObjectIdSchema.meta({ description: '团队 ID' }),
      tmbId: ObjectIdSchema.meta({ description: '团队成员 ID' }),
      uid: z.string().meta({ description: '用户 ID' }),
      encoding: z.string().optional().meta({ description: '编码' })
    })
    .meta({ description: '其他元数据' })
});
export type DatasetFileSchemaType = z.infer<typeof DatasetFileSchema>;

/* ============= search =============== */
export const SearchDataResponseItemSchema = DatasetDataItemSchema.omit({
  teamId: true,
  indexes: true,
  isOwner: true
})
  .extend({
    score: z
      .array(
        z.object({
          type: z.enum(SearchScoreTypeEnum).meta({ description: '评分类型' }),
          value: z.number().meta({ description: '评分值' }),
          index: z.number().meta({ description: '索引' })
        })
      )
      .meta({ description: '评分列表' })
  })
  .meta({ description: '搜索数据响应项' });
export type SearchDataResponseItemType = z.infer<typeof SearchDataResponseItemSchema>;

export const DatasetCiteItemSchema = z
  .object({
    _id: ObjectIdSchema.meta({ description: '数据 ID' }),
    q: z.string().meta({ description: '问题/主文本' }),
    a: z.string().optional().meta({ description: '回答/补充文本' }),
    imagePreivewUrl: z.string().optional().meta({ description: '图片预览 URL' }),
    history: DatasetDataSchema.shape.history.optional(),
    updateTime: DatasetDataSchema.shape.updateTime,
    index: DatasetDataSchema.shape.chunkIndex,
    updated: z.boolean().optional().meta({ description: '是否已更新' })
  })
  .meta({
    description: '知识库引用数据列表'
  });
export type DatasetCiteItemType = z.infer<typeof DatasetCiteItemSchema>;
