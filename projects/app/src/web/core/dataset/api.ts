import { GET, POST, PUT, DELETE } from '@/web/common/api/request';
import type { ParentTreePathItemType } from '@fastgpt/global/common/parentFolder/type.d';
import type { DatasetItemType, DatasetListItemType } from '@fastgpt/global/core/dataset/type.d';
import type {
  GetDatasetCollectionsProps,
  GetDatasetDataListProps,
  UpdateDatasetCollectionParams
} from '@/global/core/api/datasetReq.d';
import type {
  CreateDatasetCollectionParams,
  CsvTableCreateDatasetCollectionParams,
  DatasetUpdateBody,
  FileIdCreateDatasetCollectionParams,
  LinkCreateDatasetCollectionParams,
  PostWebsiteSyncParams,
  TextCreateDatasetCollectionParams
} from '@fastgpt/global/core/dataset/api.d';
import type {
  GetTrainingQueueProps,
  GetTrainingQueueResponse,
  PostPreviewFilesChunksProps,
  PostPreviewFilesChunksResponse,
  PostPreviewTableChunksResponse,
  SearchTestProps,
  SearchTestResponse
} from '@/global/core/dataset/api.d';
import type {
  UpdateDatasetDataProps,
  CreateDatasetParams,
  InsertOneDatasetDataProps
} from '@/global/core/dataset/api.d';
import type { PushDatasetDataResponse } from '@fastgpt/global/core/dataset/api.d';
import type { DatasetCollectionItemType } from '@fastgpt/global/core/dataset/type';
import {
  DatasetCollectionSyncResultEnum,
  DatasetTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import type { DatasetDataItemType } from '@fastgpt/global/core/dataset/type';
import type { DatasetCollectionsListItemType } from '@/global/core/dataset/type.d';
import { PagingData } from '@/types';

/* ======================== dataset ======================= */
export const getDatasets = (data: { parentId?: string; type?: `${DatasetTypeEnum}` }) =>
  GET<DatasetListItemType[]>(`/core/dataset/list`, data);

/**
 * get type=dataset list
 */
export const getAllDataset = () => GET<DatasetListItemType[]>(`/core/dataset/allDataset`);

export const getDatasetPaths = (parentId?: string) =>
  GET<ParentTreePathItemType[]>('/core/dataset/paths', { parentId });

export const getDatasetById = (id: string) => GET<DatasetItemType>(`/core/dataset/detail?id=${id}`);

export const postCreateDataset = (data: CreateDatasetParams) =>
  POST<string>(`/core/dataset/create`, data);

export const putDatasetById = (data: DatasetUpdateBody) => PUT<void>(`/core/dataset/update`, data);

export const delDatasetById = (id: string) => DELETE(`/core/dataset/delete?id=${id}`);

export const postWebsiteSync = (data: PostWebsiteSyncParams) =>
  POST(`/proApi/core/dataset/websiteSync`, data, {
    timeout: 600000
  }).catch();

/* =========== search test ============ */
export const postSearchText = (data: SearchTestProps) =>
  POST<SearchTestResponse>(`/core/dataset/searchTest`, data);

/* ============================= collections ==================================== */
export const getDatasetCollections = (data: GetDatasetCollectionsProps) =>
  POST<PagingData<DatasetCollectionsListItemType>>(`/core/dataset/collection/list`, data);
export const getDatasetCollectionPathById = (parentId: string) =>
  GET<ParentTreePathItemType[]>(`/core/dataset/collection/paths`, { parentId });
export const getDatasetCollectionById = (id: string) =>
  GET<DatasetCollectionItemType>(`/core/dataset/collection/detail`, { id });
export const postDatasetCollection = (data: CreateDatasetCollectionParams) =>
  POST<string>(`/core/dataset/collection/create`, data);
export const postCreateDatasetFileCollection = (data: FileIdCreateDatasetCollectionParams) =>
  POST<{ collectionId: string }>(`/core/dataset/collection/create/file`, data, { timeout: 120000 });
export const postCreateDatasetLinkCollection = (data: LinkCreateDatasetCollectionParams) =>
  POST<{ collectionId: string }>(`/core/dataset/collection/create/link`, data);
export const postCreateDatasetTextCollection = (data: TextCreateDatasetCollectionParams) =>
  POST<{ collectionId: string }>(`/core/dataset/collection/create/text`, data);
export const postCreateDatasetCsvTableCollection = (data: CsvTableCreateDatasetCollectionParams) =>
  POST<{ collectionId: string }>(`/core/dataset/collection/create/csvTable`, data, {
    timeout: 120000
  });

export const putDatasetCollectionById = (data: UpdateDatasetCollectionParams) =>
  POST(`/core/dataset/collection/update`, data);
export const delDatasetCollectionById = (params: { id: string }) =>
  DELETE(`/core/dataset/collection/delete`, params);
export const postLinkCollectionSync = (collectionId: string) =>
  POST<`${DatasetCollectionSyncResultEnum}`>(`/core/dataset/collection/sync/link`, {
    collectionId
  });

/* =============================== data ==================================== */
/* get dataset list */
export const getDatasetDataList = (data: GetDatasetDataListProps) =>
  POST(`/core/dataset/data/list`, data);

export const getDatasetDataItemById = (id: string) =>
  GET<DatasetDataItemType>(`/core/dataset/data/detail`, { id });

/**
 * insert one data to dataset (immediately insert)
 */
export const postInsertData2Dataset = (data: InsertOneDatasetDataProps) =>
  POST<string>(`/core/dataset/data/insertData`, data);

/**
 * update one datasetData by id
 */
export const putDatasetDataById = (data: UpdateDatasetDataProps) =>
  PUT('/core/dataset/data/update', data);
/**
 * 删除一条知识库数据
 */
export const delOneDatasetDataById = (id: string) =>
  DELETE<string>(`/core/dataset/data/delete`, { id });

/* ================ training ==================== */
/* get length of system training queue */
export const getTrainingQueueLen = (data: GetTrainingQueueProps) =>
  GET<GetTrainingQueueResponse>(`/core/dataset/training/getQueueLen`, data);
export const getPreviewChunks = (data: PostPreviewFilesChunksProps) =>
  POST<{ q: string; a: string }[]>('/core/dataset/file/getPreviewChunks', data);

/* ================== file ======================== */
export const getFileViewUrl = (fileId: string) =>
  GET<string>('/core/dataset/file/getPreviewUrl', { fileId });
