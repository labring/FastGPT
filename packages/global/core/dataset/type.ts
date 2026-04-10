import type { LLMModelItemType, EmbeddingModelItemType } from '../ai/model.schema';
import { PermissionTypeEnum } from '../../support/permission/constant';
import { PushDatasetDataChunkProps } from './api';
import type {
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
import type { DatasetPermission } from '../../support/permission/dataset/controller';
import type {
  ApiDatasetServerType,
  APIFileServer,
  FeishuServer,
  YuqueServer
} from './apiDataset/type';
import type { SourceMemberType } from '../../support/user/type';
import { DatasetDataIndexTypeEnum } from './data/constants';
import type { ParentIdType } from '../../common/parentFolder/type';
import z from 'zod';
import { ObjectIdSchema } from '../../common/type/mongo';

export type ChunkSettingsType = {
  trainingType?: DatasetCollectionDataProcessModeEnum;

  // Chunk trigger
  chunkTriggerType?: ChunkTriggerConfigTypeEnum;
  chunkTriggerMinSize?: number; // maxSize from agent model, not store

  // Data enhance
  dataEnhanceCollectionName?: boolean; // Auto add collection name to data

  // Index enhance
  imageIndex?: boolean;
  autoIndexes?: boolean;
  indexPrefixTitle?: boolean;

  // Chunk setting
  chunkSettingMode?: ChunkSettingModeEnum; // 系统参数/自定义参数
  chunkSplitMode?: DataChunkSplitModeEnum;
  // Paragraph split
  paragraphChunkAIMode?: ParagraphChunkAIModeEnum;
  paragraphChunkDeep?: number; // Paragraph deep
  paragraphChunkMinSize?: number; // Paragraph min size, if too small, it will merge
  // Size split
  chunkSize?: number; // chunk/qa chunk size, Paragraph max chunk size.
  // Char split
  chunkSplitter?: string; // chunk/qa chunk splitter
  indexSize?: number;

  qaPrompt?: string;
};

export type DatasetSchemaType = {
  _id: string;
  parentId: ParentIdType;
  userId: string;
  teamId: string;
  tmbId: string;
  updateTime: Date;

  avatar: string;
  name: string;
  intro: string;
  type: `${DatasetTypeEnum}`;

  vectorModel: string;
  agentModel: string;
  vlmModel?: string;

  websiteConfig?: {
    url: string;
    selector: string;
  };

  chunkSettings?: ChunkSettingsType;

  inheritPermission: boolean;

  apiDatasetServer?: ApiDatasetServerType;

  // 软删除字段
  deleteTime?: Date | null;

  /** @deprecated */
  autoSync?: boolean;
  /** @deprecated */
  externalReadUrl?: string;
  /** @deprecated */
  defaultPermission?: number;
  /** @deprecated */
  apiServer?: APIFileServer;
  /** @deprecated */
  feishuServer?: FeishuServer;
  /** @deprecated */
  yuqueServer?: YuqueServer;
};

export type DatasetCollectionSchemaType = ChunkSettingsType & {
  _id: string;
  teamId: string;
  tmbId: string;
  datasetId: string;
  parentId?: string;
  name: string;
  type: DatasetCollectionTypeEnum;
  tags?: string[];

  createTime: Date;
  updateTime: Date;

  // Status
  forbid?: boolean;

  // Collection metadata
  fileId?: string; // local file id
  rawLink?: string; // link url
  externalFileId?: string; //external file id
  apiFileId?: string; // api file id
  apiFileParentId?: string;
  externalFileUrl?: string; // external import url

  rawTextLength?: number;
  hashRawText?: string;

  metadata?: {
    webPageSelector?: string;
    relatedImgId?: string; // The id of the associated image collections

    [key: string]: any;
  };

  // Parse settings
  customPdfParse?: boolean;
  trainingType: DatasetCollectionDataProcessModeEnum;
};

export type DatasetCollectionTagsSchemaType = {
  _id: string;
  teamId: string;
  datasetId: string;
  tag: string;
};

export const DatasetDataIndexItemSchema = z.object({
  type: z.enum(DatasetDataIndexTypeEnum).meta({ description: '索引类型' }),
  dataId: z.string().meta({ description: 'vectorDB ID' }),
  text: z.string().meta({ description: '索引文本' })
});
export type DatasetDataIndexItemType = z.infer<typeof DatasetDataIndexItemSchema>;

export const DatasetDataFieldSchema = z.object({
  q: z.string().meta({ description: '问题/主文本' }),
  a: z.string().optional().meta({ description: '回答/补充文本' }),
  imageId: z.string().optional().meta({ description: '图片 ID' })
});
export type DatasetDataFieldType = z.infer<typeof DatasetDataFieldSchema>;

export const DatasetDataHistorySchema = DatasetDataFieldSchema.extend({
  updateTime: z.date().meta({ description: '更新时间' })
});
export type DatasetDataHistoryType = z.infer<typeof DatasetDataHistorySchema>;

export const DatasetDataSchema = DatasetDataFieldSchema.extend({
  _id: ObjectIdSchema.meta({ description: '数据 ID' }),
  userId: ObjectIdSchema.meta({ description: '用户 ID' }),
  teamId: ObjectIdSchema.meta({ description: '团队 ID' }),
  tmbId: ObjectIdSchema.meta({ description: '团队成员 ID' }),
  datasetId: ObjectIdSchema.meta({ description: '数据集 ID' }),
  collectionId: ObjectIdSchema.meta({ description: '集合 ID' }),
  chunkIndex: z.int().min(0).meta({ description: '块索引' }),
  updateTime: z.date().meta({ description: '更新时间' }),
  history: z.array(DatasetDataHistorySchema).optional().meta({ description: '历史版本' }),
  forbid: z.boolean().optional().meta({ description: '是否禁用' }),
  fullTextToken: z.string().meta({ description: '全文 token' }),
  indexes: z.array(DatasetDataIndexItemSchema).meta({ description: '向量索引' }),
  rebuilding: z.boolean().optional().meta({ description: '重建中' }),
  imageDescMap: z.record(z.string(), z.string()).optional().meta({ description: '图片描述映射' })
});
export type DatasetDataSchemaType = z.infer<typeof DatasetDataSchema>;

export type DatasetDataTextSchemaType = {
  _id: string;
  teamId: string;
  datasetId: string;
  collectionId: string;
  dataId: string;
  fullTextToken: string;
};

export type DatasetTrainingSchemaType = {
  _id: string;
  userId: string;
  teamId: string;
  tmbId: string;
  datasetId: string;
  collectionId: string;
  billId: string;
  expireAt: Date;
  lockTime: Date;
  mode: TrainingModeEnum;
  dataId?: string;
  q: string;
  a: string;
  imageId?: string;
  imageDescMap?: Record<string, string>;
  chunkIndex: number;
  indexSize?: number;
  weight: number;
  indexes: Omit<DatasetDataIndexItemType, 'dataId'>[];
  retryCount: number;
  errorMsg?: string;
};

export type CollectionWithDatasetType = DatasetCollectionSchemaType & {
  dataset: DatasetSchemaType;
};

/* ================= dataset ===================== */
export type DatasetSimpleItemType = {
  _id: string;
  avatar: string;
  name: string;
  vectorModel: EmbeddingModelItemType;
};
export type DatasetListItemType = {
  _id: string;
  tmbId: string;
  avatar: string;
  updateTime: Date;
  name: string;
  intro: string;
  type: `${DatasetTypeEnum}`;
  permission: DatasetPermission;
  vectorModel: EmbeddingModelItemType;
  inheritPermission: boolean;
  private?: boolean;
  sourceMember?: SourceMemberType;
};

export type DatasetItemType = Omit<DatasetSchemaType, 'vectorModel' | 'agentModel' | 'vlmModel'> & {
  status: `${DatasetStatusEnum}`;
  errorMsg?: string;
  vectorModel: EmbeddingModelItemType;
  agentModel: LLMModelItemType;
  vlmModel?: LLMModelItemType;
  permission: DatasetPermission;
};

/* ================= tag ===================== */
export type DatasetTagType = {
  _id: string;
  tag: string;
};

export type TagUsageType = {
  tagId: string;
  collections: string[];
};

/* ================= collection ===================== */
export type DatasetCollectionItemType = CollectionWithDatasetType & {
  sourceName: string;
  sourceId?: string;
  file?: {
    filename?: string;
    contentLength?: number;
  };
  permission: DatasetPermission;
  indexAmount: number;
  errorCount?: number;
};

/* ================= data ===================== */
export type DatasetDataItemType = DatasetDataFieldType & {
  id: string;
  teamId: string;
  datasetId: string;
  imagePreivewUrl?: string;
  updateTime: Date;
  collectionId: string;
  sourceName: string;
  sourceId?: string;
  chunkIndex: number;
  indexes: DatasetDataIndexItemType[];
  isOwner: boolean;
};

/* --------------- file ---------------------- */
export type DatasetFileSchema = {
  _id: string;
  length: number;
  chunkSize: number;
  uploadDate: Date;
  filename: string;
  contentType: string;
  metadata: {
    teamId: string;
    tmbId?: string;
    uid: string;
    encoding?: string;
  };
};

/* ============= search =============== */
export type SearchDataResponseItemType = Omit<
  DatasetDataItemType,
  'teamId' | 'indexes' | 'isOwner'
> & {
  score: { type: `${SearchScoreTypeEnum}`; value: number; index: number }[];
  // score: number;
};

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
