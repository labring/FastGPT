import type { ChunkSettingsType } from './type';
import type { DatasetCollectionTypeEnum } from './constants';
import type { ParentIdType } from '../../common/parentFolder/type';
import type { APIFileItemType } from './apiDataset/type';

/* ================= collection ===================== */
// Input + store params
type DatasetCollectionStoreDataType = ChunkSettingsType & {
  parentId?: ParentIdType;
  metadata?: Record<string, any>;

  customPdfParse?: boolean;
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

export type PostDatasetSyncParams = {
  datasetId: string;
};
