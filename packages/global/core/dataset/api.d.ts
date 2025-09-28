import type {
  ChunkSettingsType,
  DatasetDataIndexItemType,
  DatasetDataFieldType,
  DatasetSchemaType
} from './type';
import type {
  DatasetCollectionTypeEnum,
  DatasetCollectionDataProcessModeEnum,
  ChunkSettingModeEnum,
  DataChunkSplitModeEnum,
  ChunkTriggerConfigTypeEnum,
  ParagraphChunkAIModeEnum
} from './constants';
import type { ParentIdType } from '../../common/parentFolder/type';
import type { APIFileItemType } from './apiDataset/type';

/* ================= dataset ===================== */
export type DatasetUpdateBody = {
  id: string;

  apiDatasetServer?: DatasetSchemaType['apiDatasetServer'];

  parentId?: ParentIdType;
  name?: string;
  avatar?: string;
  intro?: string;

  agentModel?: string;
  vlmModel?: string;

  websiteConfig?: DatasetSchemaType['websiteConfig'];
  externalReadUrl?: DatasetSchemaType['externalReadUrl'];
  defaultPermission?: DatasetSchemaType['defaultPermission'];
  chunkSettings?: DatasetSchemaType['chunkSettings'];

  // sync schedule
  autoSync?: boolean;
};

/* ================= collection ===================== */
// Input + store params
type DatasetCollectionStoreDataType = ChunkSettingsType & {
  parentId?: string;
  metadata?: Record<string, any>;

  customPdfParse?: boolean;
};

// create collection params
export type CreateDatasetCollectionParams = DatasetCollectionStoreDataType & {
  datasetId: string;
  name: string;
  type: DatasetCollectionTypeEnum;

  fileId?: string;
  rawLink?: string;
  externalFileId?: string;
  externalFileUrl?: string;
  apiFileId?: string;
  apiFileParentId?: string; //when file is imported by folder, the parentId is the folderId

  rawTextLength?: number;
  hashRawText?: string;

  tags?: string[];

  createTime?: Date;
  updateTime?: Date;
};

export type ApiCreateDatasetCollectionParams = DatasetCollectionStoreDataType & {
  datasetId: string;
  tags?: string[];
};
export type TextCreateDatasetCollectionParams = ApiCreateDatasetCollectionParams & {
  name: string;
  text: string;
};
export type LinkCreateDatasetCollectionParams = ApiCreateDatasetCollectionParams & {
  link: string;
};
export type ApiDatasetCreateDatasetCollectionParams = ApiCreateDatasetCollectionParams & {
  name: string;
  apiFileId: string;
};
export type ApiDatasetCreateDatasetCollectionV2Params = ApiCreateDatasetCollectionParams & {
  apiFiles: APIFileItemType[];
};
export type FileIdCreateDatasetCollectionParams = ApiCreateDatasetCollectionParams & {
  fileId: string;
};
export type reTrainingDatasetFileCollectionParams = DatasetCollectionStoreDataType & {
  datasetId: string;
  collectionId: string;
};
export type FileCreateDatasetCollectionParams = ApiCreateDatasetCollectionParams & {
  fileMetadata?: Record<string, any>;
  collectionMetadata?: Record<string, any>;
};
export type CsvTableCreateDatasetCollectionParams = {
  datasetId: string;
  parentId?: string;
  fileId: string;
};
export type ExternalFileCreateDatasetCollectionParams = ApiCreateDatasetCollectionParams & {
  externalFileId?: string;
  externalFileUrl: string;
  filename?: string;
};
export type ImageCreateDatasetCollectionParams = ApiCreateDatasetCollectionParams & {
  collectionName: string;
};

/* ================= tag ===================== */
export type CreateDatasetCollectionTagParams = {
  datasetId: string;
  tag: string;
};
export type AddTagsToCollectionsParams = {
  originCollectionIds: string[];
  collectionIds: string[];
  datasetId: string;
  tag: string;
};
export type UpdateDatasetCollectionTagParams = {
  datasetId: string;
  tagId: string;
  tag: string;
};

/* ================= data ===================== */
export type PgSearchRawType = {
  id: string;
  collection_id: string;
  score: number;
};
export type PushDatasetDataChunkProps = {
  q?: string;
  a?: string;
  imageId?: string;
  chunkIndex?: number;
  indexes?: Omit<DatasetDataIndexItemType, 'dataId'>[];
};

export type PostDatasetSyncParams = {
  datasetId: string;
};

export type PushDatasetDataProps = {
  collectionId: string;
  data: PushDatasetDataChunkProps[];
  trainingType?: DatasetCollectionDataProcessModeEnum;
  indexSize?: number;
  autoIndexes?: boolean;
  imageIndex?: boolean;
  prompt?: string;

  billId?: string;

  // Abandon
  trainingMode?: DatasetCollectionDataProcessModeEnum;
};
export type PushDatasetDataResponse = {
  insertLen: number;
};
