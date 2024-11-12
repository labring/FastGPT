import { GET, POST, PUT, DELETE } from '@/web/common/api/request';
import type {
  ParentIdType,
  ParentTreePathItemType
} from '@fastgpt/global/common/parentFolder/type.d';
import type {
  DatasetItemType,
  DatasetListItemType,
  DatasetSimpleItemType,
  DatasetTagType,
  TagUsageType
} from '@fastgpt/global/core/dataset/type.d';
import type { GetDatasetCollectionsProps } from '@/global/core/api/datasetReq.d';
import type {
  AddTagsToCollectionsParams,
  CreateDatasetCollectionParams,
  CreateDatasetCollectionTagParams,
  CsvTableCreateDatasetCollectionParams,
  DatasetUpdateBody,
  ExternalFileCreateDatasetCollectionParams,
  FileIdCreateDatasetCollectionParams,
  LinkCreateDatasetCollectionParams,
  PostWebsiteSyncParams,
  TextCreateDatasetCollectionParams,
  UpdateDatasetCollectionTagParams
} from '@fastgpt/global/core/dataset/api.d';
import type {
  GetTrainingQueueProps,
  GetTrainingQueueResponse,
  SearchTestProps,
  SearchTestResponse
} from '@/global/core/dataset/api.d';
import type { CreateDatasetParams, InsertOneDatasetDataProps } from '@/global/core/dataset/api.d';
import type { DatasetCollectionItemType } from '@fastgpt/global/core/dataset/type';
import { DatasetCollectionSyncResultEnum } from '@fastgpt/global/core/dataset/constants';
import type { DatasetDataItemType } from '@fastgpt/global/core/dataset/type';
import type {
  DatasetCollectionsListItemType,
  DatasetDataListItemType
} from '@/global/core/dataset/type.d';
import { PagingData } from '@/types';
import type { getDatasetTrainingQueueResponse } from '@/pages/api/core/dataset/training/getDatasetTrainingQueue';
import type { rebuildEmbeddingBody } from '@/pages/api/core/dataset/training/rebuildEmbedding';
import type {
  PostPreviewFilesChunksProps,
  PreviewChunksResponse
} from '@/pages/api/core/dataset/file/getPreviewChunks';
import type { readCollectionSourceResponse } from '@/pages/api/core/dataset/collection/read';
import type { GetDatasetListBody } from '@/pages/api/core/dataset/list';
import type { UpdateDatasetCollectionParams } from '@/pages/api/core/dataset/collection/update';
import type {
  GetDatasetDataListProps,
  GetDatasetDataListRes
} from '@/pages/api/core/dataset/data/v2/list';
import type { UpdateDatasetDataProps } from '@fastgpt/global/core/dataset/controller';
import type { DatasetFolderCreateBody } from '@/pages/api/core/dataset/folder/create';
import type { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';
import type { GetScrollCollectionsProps } from '@/pages/api/core/dataset/collection/scrollList';
import { AuthOutLinkProps } from '@fastgpt/global/support/outLink/api';

/* ======================== dataset ======================= */
export const getDatasets = (data: GetDatasetListBody) =>
  POST<DatasetListItemType[]>(`/core/dataset/list`, data);

/**
 * get type=dataset list
 */
export const getAllDataset = () => GET<DatasetSimpleItemType[]>(`/core/dataset/allDataset`);

export const getDatasetPaths = (parentId: ParentIdType) =>
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

export const postCreateDatasetFolder = (data: DatasetFolderCreateBody) =>
  POST(`/core/dataset/folder/create`, data);

export const resumeInheritPer = (datasetId: string) =>
  GET(`/core/dataset/resumeInheritPermission`, { datasetId });

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
  POST<{ collectionId: string }>(`/core/dataset/collection/create/fileId`, data, {
    timeout: 360000
  });
export const postCreateDatasetLinkCollection = (data: LinkCreateDatasetCollectionParams) =>
  POST<{ collectionId: string }>(`/core/dataset/collection/create/link`, data);
export const postCreateDatasetTextCollection = (data: TextCreateDatasetCollectionParams) =>
  POST<{ collectionId: string }>(`/core/dataset/collection/create/text`, data);
export const postCreateDatasetCsvTableCollection = (data: CsvTableCreateDatasetCollectionParams) =>
  POST<{ collectionId: string }>(`/core/dataset/collection/create/csvTable`, data, {
    timeout: 360000
  });
export const postCreateDatasetExternalFileCollection = (
  data: ExternalFileCreateDatasetCollectionParams
) =>
  POST<{ collectionId: string }>(`/proApi/core/dataset/collection/create/externalFileUrl`, data, {
    timeout: 360000
  });

export const putDatasetCollectionById = (data: UpdateDatasetCollectionParams) =>
  POST(`/core/dataset/collection/update`, data);
export const delDatasetCollectionById = (params: { id: string }) =>
  DELETE(`/core/dataset/collection/delete`, params);
export const postLinkCollectionSync = (collectionId: string) =>
  POST<DatasetCollectionSyncResultEnum>(`/core/dataset/collection/sync/link`, {
    collectionId
  });

/* =============================== tag ==================================== */

export const postCreateDatasetCollectionTag = (data: CreateDatasetCollectionTagParams) =>
  POST(`/proApi/core/dataset/tag/create`, data);
export const postAddTagsToCollections = (data: AddTagsToCollectionsParams) =>
  POST(`/proApi/core/dataset/tag/addToCollections`, data);
export const delDatasetCollectionTag = (data: { id: string; datasetId: string }) =>
  DELETE(`/proApi/core/dataset/tag/delete`, data);
export const updateDatasetCollectionTag = (data: UpdateDatasetCollectionTagParams) =>
  POST(`/proApi/core/dataset/tag/update`, data);
export const getDatasetCollectionTags = (
  data: PaginationProps<{
    datasetId: string;
    searchText?: string;
  }>
) => POST<PaginationResponse<DatasetTagType>>(`/proApi/core/dataset/tag/list`, data);
export const getTagUsage = (datasetId: string) =>
  GET<TagUsageType[]>(`/proApi/core/dataset/tag/tagUsage?datasetId=${datasetId}`);
export const getAllTags = (datasetId: string) =>
  GET<{ list: DatasetTagType[] }>(`/proApi/core/dataset/tag/getAllTags?datasetId=${datasetId}`);
export const getScrollCollectionList = (data: GetScrollCollectionsProps) =>
  POST<PaginationResponse<DatasetCollectionsListItemType>>(
    `/core/dataset/collection/scrollList`,
    data
  );

/* =============================== data ==================================== */
/* get dataset list */
export const getDatasetDataList = (data: GetDatasetDataListProps) =>
  POST<GetDatasetDataListRes>(`/core/dataset/data/v2/list`, data);

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
export const postRebuildEmbedding = (data: rebuildEmbeddingBody) =>
  POST(`/core/dataset/training/rebuildEmbedding`, data);

/* get length of system training queue */
export const getTrainingQueueLen = (data: GetTrainingQueueProps) =>
  GET<GetTrainingQueueResponse>(`/core/dataset/training/getQueueLen`, data);
export const getDatasetTrainingQueue = (datasetId: string) =>
  GET<getDatasetTrainingQueueResponse>(`/core/dataset/training/getDatasetTrainingQueue`, {
    datasetId
  });

export const getPreviewChunks = (data: PostPreviewFilesChunksProps) =>
  POST<PreviewChunksResponse>('/core/dataset/file/getPreviewChunks', data);

/* ================== read source ======================== */
export const getCollectionSource = (
  data: { collectionId: string; isShare?: boolean } & AuthOutLinkProps
) => POST<readCollectionSourceResponse>('/core/dataset/collection/read', data);
