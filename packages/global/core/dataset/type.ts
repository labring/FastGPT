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
  FeishuServerSchema,
  YuqueServerSchema
} from './apiDataset/type';
import type { DatasetPermission } from '../../support/permission/dataset/controller';
import type { CollectionStatusEnum, DatasetTrainingStatusEnum } from '../../core/dataset/constants';
import { SourceMemberSchema } from '../../support/user/type';
import { DatasetDataIndexTypeEnum } from './data/constants';
import { ParentIdSchema } from '../../common/parentFolder/type';
import z from 'zod';
import { ObjectIdSchema } from '../../common/type/mongo';
import { PermissionSchema } from '../../support/permission/controller';
import { PermissionEffectScopeEnum } from '../../support/permission/constant';

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
  hypeIndexes: z.boolean().optional().meta({ description: '超级索引' }),
  small2bigIndexes: z.boolean().optional().meta({ description: '小到大索引' }),
  hypeIndexPrompt: z.string().optional().meta({ description: '超级索引提示词' }),
  small2bigConfig: z
    .object({
      chunkSize: z.number().optional(),
      customSplitChar: z.string().optional(),
      overlap: z.number().optional(),
      overlapRatio: z.number().optional(),
      maxChildChunks: z.number().optional(),
      paragraphChunkDeep: z.number().optional(),
      paragraphChunkMinSize: z.number().optional(),
      maxSize: z.number().optional(),
      customReg: z.array(z.string()).optional()
    })
    .optional()
    .meta({ description: '小到大索引配置' }),
  autoIndexesPrompt: z.string().optional().meta({ description: '自动索引提示词' }),
  imageIndexPrompt: z.string().optional().meta({ description: '图片索引提示词' }),
  qaPrompt: z.string().optional().meta({ description: 'QA 拆分提示词' })
});
export type ChunkSettingsType = z.infer<typeof ChunkSettingsSchema>;
export type small2bigConfigType = NonNullable<ChunkSettingsType['small2bigConfig']>;

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
    permissionEffectScope: z
      .nativeEnum(PermissionEffectScopeEnum)
      .optional()
      .meta({ description: '权限生效范围' }),

    avatar: z.string().meta({ description: '头像' }),
    name: z.string().meta({ description: '名称' }),
    intro: z.string().meta({ description: '简介' }),
    type: z.enum(DatasetTypeEnum).meta({ description: '数据集类型' }),

    vectorModelId: z.string().meta({ description: '向量模型id' }),
    agentModelId: z.string().meta({ description: 'AI 模型id' }),
    vlmModelId: z.string().optional().meta({ description: '视觉语言模型Id' }),

    websiteConfig: z
      .object({
        url: z.string().meta({ description: '网站 URL' }),
        selector: z.string().meta({ description: '网站选择器' })
      })
      .optional()
      .meta({ description: '网站配置' }),
    chunkSettings: ChunkSettingsSchema.optional().meta({ description: '分块配置' }),
    synonymFiles: z.array(z.string()).optional().meta({ description: '同义词文件' }),
    databaseConfig: z.any().optional().meta({ description: '数据库配置' }),

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
    })
  })
  .meta({ description: '知识库' });
export type DatasetSchemaType = z.infer<typeof DatasetSchema>;

/* ===== Collection tag value ===== */
export type CollectionTagValueType = {
  tagId: string; // 引用 dataset_collection_tags._id
  value: string | number; // string 类型存字符串，datetime 类型存 UTC 毫秒时间戳（number）
  label?: string; // 标签名称（展示用），由服务端在列表接口返回时附加
};
export const CollectionTagValueSchema = z.object({
  tagId: z.string().meta({ description: '标签 ID' }),
  value: z.union([z.string(), z.number()]).meta({ description: '标签值' })
});

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
  tags: z
    .array(z.union([z.string(), CollectionTagValueSchema]))
    .optional()
    .meta({ description: '标签' }),

  createTime: z.coerce.date().meta({ description: '创建时间' }),
  updateTime: z.coerce.date().meta({ description: '更新时间' }),
  parsingCompleteTime: z.coerce.date().optional().meta({ description: '解析完成时间' }),
  parseStartTime: z.coerce
    .date()
    .optional()
    .meta({ description: '解析开始时间（Worker 首次拉取 parse 任务时设置）' }),
  indexingStartTime: z.coerce
    .date()
    .optional()
    .meta({ description: '索引开始时间（Worker 首次拉取非 parse 任务时设置）' }),
  indexingCompleteTime: z.coerce.date().optional().meta({ description: '索引完成时间' }),

  forbid: z.boolean().optional().meta({ description: '是否禁用' }),

  // Permission
  inheritPermission: z.boolean().optional().meta({ description: '继承权限' }),
  permissionEffectScope: z
    .nativeEnum(PermissionEffectScopeEnum)
    .optional()
    .meta({ description: '权限生效范围' }),

  fileId: z.string().optional().meta({ description: '文件 ID' }),
  rawLink: z.string().optional().meta({ description: '原始链接' }),
  externalFileId: z.string().optional().meta({ description: '外部文件 ID' }),
  apiFileId: z.string().optional().meta({ description: 'API 文件 ID' }),
  apiFileParentId: z.string().optional().meta({ description: 'API 文件父级 ID' }),
  externalFileUrl: z.string().optional().meta({ description: '外部文件 URL' }),

  rawTextLength: z.number().optional().meta({ description: '原始文本长度' }),
  hashRawText: z.string().optional().meta({ description: '文本哈希' }),
  fileMd5: z.string().optional().meta({ description: '文件内容 MD5' }),

  metadata: z.record(z.string(), z.any()).optional().meta({ description: '其他元数据' }),

  customPdfParse: z.boolean().optional().meta({ description: '自定义 PDF 解析' }),
  trainingType: z
    .enum(DatasetCollectionDataProcessModeEnum)
    .optional()
    .meta({ description: '训练类型' }),
  tableSchema: z.any().optional().meta({ description: '数据库表结构' }),
  deleteTime: z.date().nullish().meta({ description: '软删除时间' }),

  // Precomputed statistics (updated asynchronously by collectionUpdate worker)
  dataAmount: z.number().optional().meta({ description: '分片数据总量' }),
  trainingAmount: z.number().optional().meta({ description: '训练任务总量' }),
  processedCount: z.number().optional().meta({ description: '已完成索引的数据量' }),
  remainingCount: z.number().optional().meta({ description: '未完成索引的数据量' }),
  hasError: z.boolean().optional().meta({ description: '是否有训练任务报错' }),
  allParse: z.boolean().optional().meta({ description: '是否所有训练任务都是 parse 模式' }),
  statsUpdatedAt: z.coerce.date().optional().meta({ description: '统计数据最后更新时间' })
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
  text: z.string().meta({ description: '索引文本' }),
  synId: z.number().optional().meta({ description: '合成对 ID' }),
  synonymMetadata: z
    .object({
      synonymFileIds: z.array(z.string()),
      transformations: z.array(z.any())
    })
    .optional()
    .meta({ description: '同义词转换元数据' })
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

export const DatasetDataPhaseTimingSchema = z.object({
  phase: z.string().meta({ description: '处理阶段名称' }),
  startTime: z.coerce.date().meta({ description: '开始时间' }),
  endTime: z.coerce.date().optional().meta({ description: '结束时间' })
});
export type DatasetDataPhaseTimingType = z.infer<typeof DatasetDataPhaseTimingSchema>;

export const DatasetDataSchema = DatasetDataFieldSchema.extend({
  _id: ObjectIdSchema.meta({ description: '数据 ID' }),
  userId: ObjectIdSchema.optional().meta({ description: '用户 ID', deprecated: true }),
  teamId: ObjectIdSchema.meta({ description: '团队 ID' }),
  tmbId: ObjectIdSchema.meta({ description: '团队成员 ID' }),
  datasetId: ObjectIdSchema.meta({ description: '数据集 ID' }),
  collectionId: ObjectIdSchema.meta({ description: '集合 ID' }),
  chunkIndex: z.int().min(0).meta({ description: '块索引' }),
  createTime: z.coerce.date().optional().meta({ description: '创建时间（入库时间）' }),
  updateTime: z.coerce.date().meta({ description: '更新时间' }),
  indexingCompleteTime: z.coerce.date().optional().meta({ description: '索引完成时间' }),
  history: z.array(DatasetDataHistorySchema).optional().meta({ description: '历史版本' }),
  forbid: z.boolean().optional().meta({ description: '是否禁用' }),
  fullTextToken: z.string().meta({ description: '全文 token' }),
  indexes: z.array(DatasetDataIndexItemSchema).meta({ description: '向量索引' }),
  rebuilding: z.boolean().optional().meta({ description: '重建中' }),
  imageDescMap: z.record(z.string(), z.string()).optional().meta({ description: '图片描述映射' }),
  metadata: z.record(z.string(), z.any()).optional().meta({ description: '元数据' }),
  synonymProcessing: z
    .enum(['standardize', 'restore'])
    .optional()
    .meta({ description: '同义词处理状态' }),
  synonymFileIds: z.array(z.string()).optional().meta({ description: '同义词文件 ID' }),
  phaseTimings: z
    .array(DatasetDataPhaseTimingSchema)
    .optional()
    .meta({ description: '各处理阶段的开始/结束时间' })
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
  useGpuQueue: z.boolean().optional().meta({ description: '是否使用GPU队列' }),
  dataMetadata: z.record(z.string(), z.any()).optional().meta({ description: '数据元数据' }),

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
  permissionEffectScope: z
    .nativeEnum(PermissionEffectScopeEnum)
    .optional()
    .meta({ description: '权限生效范围' }),
  private: z.boolean().optional().meta({ description: '是否私有' }),
  sourceMember: SourceMemberSchema.optional().meta({ description: '来源成员' }),
  dataCount: z.number().optional().meta({ description: '数据数量' }),
  appCount: z.number().optional().meta({ description: '关联应用数量' }),
  fileCount: z.number().optional().meta({ description: '文件数量' }),
  processingCount: z.number().optional().meta({ description: '处理中的文件数量' })
});
export type DatasetListItemType = z.infer<typeof DatasetListItemSchema>;

export const DatasetItemSchema = DatasetSchema.omit({
  vectorModelId: true,
  agentModelId: true,
  vlmModelId: true
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
  tag: z.string().meta({ description: '标签' }),
  tagType: z.enum(['string', 'number', 'datetime']).optional().meta({ description: '标签类型' })
});
export type DatasetTagType = z.infer<typeof DatasetTagSchema>;

export const TagUsageSchema = z.object({
  tagId: ObjectIdSchema.meta({ description: '标签 ID' }),
  collections: z.array(ObjectIdSchema).meta({ description: '集合 ID' })
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
  isOwner: z.boolean().meta({ description: '是否为 owner' }),
  metadata: z.record(z.string(), z.any()).optional().meta({ description: '元数据' }),
  trainingStatus: z.string().optional().meta({ description: '训练状态' })
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
  id: ObjectIdSchema.optional().meta({ description: '自定义数据 ID' }),
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
  metadata: z.record(z.string(), z.any()).optional().meta({ description: '数据元数据' }),
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
      .meta({ description: '评分列表' }),
    retrievalRank: z.number().optional().meta({ description: '检索排名' }),
    synonymMappings: z.array(z.any()).optional().meta({ description: '同义词映射' })
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

/* ============= Database types =============== */
export type DatabaseConfig = {
  clientType: string;
  version?: string;
  host: string;
  port?: number;
  database: string;
  user: string;
  password: string;
  poolSize?: number;
  schema?: string;
  encrypt?: boolean;
  trustServerCertificate?: boolean;
};

export type ColumnSchemaType = {
  columnName: string;
  columnType: string;
  description: string;
  examples: string[];
  forbid: boolean;
  valueIndex: boolean;
  isNullable?: boolean;
  defaultValue?: string | null;
  isAutoIncrement?: boolean;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  relatedColumns?: string[];
  metadata?: Record<string, any>;
};

export type ConstraintSchemaType = {
  name: string;
  column: string;
};

export type ForeignKeySchemaType = ConstraintSchemaType & {
  referredSchema: string;
  referredTable: string;
  referredColumns: string;
};

export type TableSchemaType = {
  tableName: string;
  description: string;
  exist: boolean;
  columns: Record<string, ColumnSchemaType>;
  foreignKeys: ForeignKeySchemaType[];
  primaryKeys: string[];
  constraints: ConstraintSchemaType[];
  lastUpdated: Date;
};

/* ============= Assistant source types =============== */
export type AssistantSourceType = 'faq' | 'sql' | 'correction' | 'chunk';

export type AssistantDatasetCiteItemType = DatasetCiteItemType & {
  sourceType: AssistantSourceType;
};

export type AssistantSearchDataResponseItemType = SearchDataResponseItemType & {
  sourceType: AssistantSourceType;
};

/* ============= Synonym types =============== */
export type DatasetSynonymSchemaType = {
  _id: string;
  teamId: string;
  datasetId: string;
  fileName: string;
  fileId: string;
  size: number;
  uploadTime: Date;
  uploaderId: string;
};

export type DatasetSynonymMappingSchemaType = {
  _id: string;
  teamId: string;
  datasetId: string;
  synonymFileId: string;
  standardizedTerm: string;
  synonymTerms: string[];
  allTerms: string;
  createdTime: Date;
  updatedTime: Date;
};

export type TransformationRecordType = {
  originalStartPos: number;
  originalEndPos: number;
  originalTerm: string;
  transformedStartPos: number;
  transformedEndPos: number;
  standardizedTerm: string;
  synonymMappingId: string;
};

export type DatasetCollectionsListItemType = {
  tableSchemaDescription?: DatasetCollectionSchemaType['tableSchema']['description'];
  _id: string;
  parentId?: string | null;
  tmbId: DatasetCollectionSchemaType['tmbId'];
  name: DatasetCollectionSchemaType['name'];
  type: DatasetCollectionSchemaType['type'];
  createTime: DatasetCollectionSchemaType['createTime'];
  updateTime: DatasetCollectionSchemaType['updateTime'];
  forbid?: DatasetCollectionSchemaType['forbid'];
  trainingType?: DatasetCollectionSchemaType['trainingType'];
  tags?: (string | CollectionTagValueType)[];

  externalFileId?: string;
  autoSync?: boolean;

  fileId?: string;
  rawLink?: string;
  permission: DatasetPermission;
  inheritPermission?: DatasetCollectionSchemaType['inheritPermission'];
  permissionEffectScope?: DatasetCollectionSchemaType['permissionEffectScope'];

  dataAmount: number;
  trainingAmount: number;
  processedCount?: number;
  remainingCount?: number;
  hasError?: boolean;

  // 计算得出的状态字段
  // - 对于普通文件：单一状态值
  // - 对于 folder：使用 matchingStatuses 数组（递归聚合模式）
  status?: CollectionStatusEnum; // 文件的单一状态（folder 无此字段）
  matchingStatuses?: CollectionStatusEnum[]; // folder 的匹配状态数组（仅 folder 类型有此字段）

  // For database type datasets, include table schema description
  tableSchema?: DatasetCollectionSchemaType['tableSchema'];

  // For structureDocument type datasets, include row and column count
  rows?: number;
  cols?: number;
};

/* ================= data ===================== */
export type DatasetDataListItemType = {
  _id: string;
  datasetId: string;
  collectionId: string;
  q?: string;
  a?: string;
  imageId?: string;
  imageSize?: number;
  imagePreviewUrl?: string; //image preview url
  chunkIndex?: number;
  updated?: boolean;
  trainingStatus?: `${DatasetTrainingStatusEnum}`;
};
