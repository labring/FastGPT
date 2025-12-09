import type { LLMModelItemType, EmbeddingModelItemType } from '../../core/ai/model.d';
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
  DatabaseTypeEnum
} from './constants';
import type { DatasetPermission } from '../../support/permission/dataset/controller';
import type {
  ApiDatasetServerType,
  APIFileServer,
  FeishuServer,
  YuqueServer
} from './apiDataset/type';
import type { SourceMemberType } from 'support/user/type';
import type { DatasetDataIndexTypeEnum } from './data/constants';
import type { ParentIdType } from 'common/parentFolder/type';
import type { CollectionStatusEnum } from 'core/dataset/collection/schema';
import type { SplitProps } from '@fastgpt/global/common/string/textSplitter';

export type small2bigConfigType = Omit<SplitProps, 'text'> & {
  maxChildChunks?: number;
};

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
  hypeIndexes?: boolean;
  small2bigIndexes?: boolean;
  hypeIndexPrompt?: string;
  small2bigConfig?: small2bigConfigType;
  autoIndexesPrompt?: string;
  imageIndexPrompt?: string;
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

export type DatabaseConfig = {
  clientType: DatabaseTypeEnum;
  version?: string;
  host: string;
  port?: number;
  database: string;
  user: string;
  password: string;
  encrypt?: boolean;
  poolSize?: number;
};

// Database table schema types
export type ColumnSchemaType = {
  columnName: string;
  columnType: string;
  description: string;
  examples: string[];
  forbid: boolean;
  valueIndex: boolean;

  // Database attributes
  isNullable?: boolean;
  defaultValue?: string | null;
  isAutoIncrement?: boolean;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  relatedColumns?: string[];

  // Extended metadata
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

  // 同义词文件ID数组（当前版本仅支持单个文件）
  synonymFiles?: string[];

  apiDatasetServer?: ApiDatasetServerType;

  databaseConfig?: DatabaseConfig;
  // abandon
  autoSync?: boolean;
  externalReadUrl?: string;
  defaultPermission?: number;
  apiServer?: APIFileServer;
  feishuServer?: FeishuServer;
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

  // Database table schema (for database type collections)
  tableSchema?: TableSchemaType;
};

export type DatasetCollectionTagsSchemaType = {
  _id: string;
  teamId: string;
  datasetId: string;
  tag: string;
};

export type DatasetDataIndexItemType = {
  type: `${DatasetDataIndexTypeEnum}`;
  dataId: string; // pg data id
  text: string; // ⚠️ 存储标准化后的文本

  // 该 index 的同义词转换元数据
  synonymMetadata?: {
    synonymFileIds: string[]; // 关联的同义词文件ID数组
    transformations: TransformationRecordType[]; // 转换记录
  };
};

export type DatasetDataFieldType = {
  q: string; // large chunks or question
  a?: string; // answer or custom content
  imageId?: string;
};

export type DatasetDataSchemaType = DatasetDataFieldType & {
  _id: string;
  userId: string;
  teamId: string;
  tmbId: string;
  datasetId: string;
  collectionId: string;
  chunkIndex: number;
  updateTime: Date;
  history?: (DatasetDataFieldType & {
    updateTime: Date;
  })[];
  forbid?: boolean;
  fullTextToken: string;
  indexes: DatasetDataIndexItemType[];
  rebuilding?: boolean;
  imageDescMap?: Record<string, string>;
  metadata?: Record<string, any>;

  // 同义词处理状态 (标记数据需要被处理)
  synonymProcessing?: 'standardize' | 'restore';
  synonymFileIds?: string[]; // 需要应用的同义词文件ID数组
};

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
  dataMetadata?: Record<string, any>;
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
  dataCount?: number;
};

export type DatasetItemType = Omit<DatasetSchemaType, 'vectorModel' | 'agentModel' | 'vlmModel'> & {
  status: `${DatasetStatusEnum}`;
  errorMsg?: string;
  vectorModel?: EmbeddingModelItemType;
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
  file?: DatasetFileSchema;
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
  metadata?: Record<string, any>;
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

export type DatasetCiteItemType = {
  _id: string;
  q: string;
  a?: string;
  imagePreivewUrl?: string;
  history?: DatasetDataSchemaType['history'];
  updateTime: DatasetDataSchemaType['updateTime'];
  index: DatasetDataSchemaType['chunkIndex'];
  updated?: boolean;
};

/* ============= synonym =============== */
/**
 * 同义词文件元数据
 * 存储上传到知识库的同义词CSV文件的元信息
 */
export type DatasetSynonymSchemaType = {
  _id: string;
  teamId: string;
  datasetId: string;
  fileName: string;
  fileId: string; // GridFS 文件ID
  size: number; // 文件大小（字节）
  uploadTime: Date;
  uploaderId: string;
};

/**
 * 同义词映射记录
 * 存储标准化词到同义词的映射关系,支持全文检索
 */
export type DatasetSynonymMappingSchemaType = {
  _id: string;
  teamId: string;
  datasetId: string;
  synonymFileId: string; // 关联的同义词文件ID
  standardizedTerm: string; // 标准化词
  synonymTerms: string[]; // 同义词数组
  allTerms: string; // 组合搜索字段: "{标准词} {同义词1} {同义词2}..."
  createdTime: Date;
  updatedTime: Date;
};

/**
 * 文本转换记录（单个转换项）
 * 记录一次同义词替换的详细信息
 */
export type TransformationRecordType = {
  // 在原始文本中的位置信息
  originalStartPos: number; // 原始文本中的起始位置（字符索引）
  originalEndPos: number; // 原始文本中的结束位置（字符索引）
  originalTerm: string; // 原始词汇（非标准词）

  // 在转换后文本中的位置信息
  transformedStartPos: number; // 转换后文本中的起始位置（字符索引）
  transformedEndPos: number; // 转换后文本中的结束位置（字符索引）
  standardizedTerm: string; // 标准化词

  // 关联信息
  synonymMappingId: string; // 关联的同义词映射记录ID（MongoSynonymMapping._id）
};
