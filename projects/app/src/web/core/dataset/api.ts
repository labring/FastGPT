import { GET, POST, PUT, DELETE } from '@/web/common/api/request';
import type {
  GetPathProps,
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
  ApiDatasetCreateDatasetCollectionParams,
  CreateDatasetCollectionParams,
  CreateDatasetCollectionTagParams,
  DatasetUpdateBody,
  ExternalFileCreateDatasetCollectionParams,
  FileIdCreateDatasetCollectionParams,
  reTrainingDatasetFileCollectionParams,
  LinkCreateDatasetCollectionParams,
  PostWebsiteSyncParams,
  TextCreateDatasetCollectionParams,
  UpdateDatasetCollectionTagParams
} from '@fastgpt/global/core/dataset/api.d';
import type { SearchTestProps, SearchTestResponse } from '@/global/core/dataset/api.d';
import type { CreateDatasetParams, InsertOneDatasetDataProps } from '@/global/core/dataset/api.d';
import type { DatasetCollectionItemType } from '@fastgpt/global/core/dataset/type';
import type { DatasetCollectionSyncResultEnum } from '@fastgpt/global/core/dataset/constants';
import type { DatasetDataItemType } from '@fastgpt/global/core/dataset/type';
import type { DatasetCollectionsListItemType } from '@/global/core/dataset/type.d';
import type { getDatasetTrainingQueueResponse } from '@/pages/api/core/dataset/training/getDatasetTrainingQueue';
import type { rebuildEmbeddingBody } from '@/pages/api/core/dataset/training/rebuildEmbedding';
import type {
  PostPreviewFilesChunksProps,
  PreviewChunksResponse
} from '@/pages/api/core/dataset/file/getPreviewChunks';
import type {
  readCollectionSourceBody,
  readCollectionSourceResponse
} from '@/pages/api/core/dataset/collection/read';
import type { GetDatasetListBody } from '@/pages/api/core/dataset/list';
import type { UpdateDatasetCollectionParams } from '@/pages/api/core/dataset/collection/update';
import type {
  GetDatasetDataListProps,
  GetDatasetDataListRes
} from '@/pages/api/core/dataset/data/v2/list';
import type { UpdateDatasetDataProps } from '@fastgpt/global/core/dataset/controller';
import type { DatasetFolderCreateBody } from '@/pages/api/core/dataset/folder/create';
import type { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';
import type { GetApiDatasetFileListProps } from '@/pages/api/core/dataset/apiDataset/list';
import type {
  listExistIdQuery,
  listExistIdResponse
} from '@/pages/api/core/dataset/apiDataset/listExistId';
import type { GetQuoteDataResponse } from '@/pages/api/core/dataset/data/getQuoteData';
import type { GetQuotePermissionResponse } from '@/pages/api/core/dataset/data/getPermission';
import type { GetQueueLenResponse } from '@/pages/api/core/dataset/training/getQueueLen';
import type { updateTrainingDataBody } from '@/pages/api/core/dataset/training/updateTrainingData';
import type {
  getTrainingDataDetailBody,
  getTrainingDataDetailResponse
} from '@/pages/api/core/dataset/training/getTrainingDataDetail';
import type { deleteTrainingDataBody } from '@/pages/api/core/dataset/training/deleteTrainingData';
import type { getTrainingDetailResponse } from '@/pages/api/core/dataset/collection/trainingDetail';
import type {
  getTrainingErrorBody,
  getTrainingErrorResponse
} from '@/pages/api/core/dataset/training/getTrainingError';
import type { APIFileItem } from '@fastgpt/global/core/dataset/apiDataset/type';
import type { GetQuoteDataProps } from '@/pages/api/core/dataset/data/getQuoteData';
import type {
  GetApiDatasetCataLogResponse,
  GetApiDatasetCataLogProps
} from '@/pages/api/core/dataset/apiDataset/getCatalog';
import type {
  GetApiDatasetPathBody,
  GetApiDatasetPathResponse
} from '@/pages/api/core/dataset/apiDataset/getPathNames';

/* ======================== dataset ======================= */
export const getDatasets = (data: GetDatasetListBody) =>
  POST<DatasetListItemType[]>(`/core/dataset/list`, data);

export const getDatasetsByAppIdAndDatasetIds = (data: { appId: string; datasetIdList: string[] }) =>
  POST<DatasetSimpleItemType[]>(`/core/dataset/listByAppIdAndDatasetIds`, data);
/**
 * get type=dataset list
 */

export const getDatasetPaths = (data: GetPathProps) => {
  if (!data.sourceId) return Promise.resolve([]);
  return GET<ParentTreePathItemType[]>('/core/dataset/paths', data);
};

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

export const postChangeOwner = (data: { ownerId: string; datasetId: string }) =>
  POST(`/proApi/core/dataset/changeOwner`, data);

export const postBackupDatasetCollection = ({
  file,
  percentListen,
  datasetId
}: {
  file: File;
  percentListen: (percent: number) => void;
  datasetId: string;
}) => {
  const formData = new FormData();
  formData.append('file', file, encodeURIComponent(file.name));
  formData.append('data', JSON.stringify({ datasetId }));

  return POST(`/core/dataset/collection/create/backup`, formData, {
    timeout: 600000,
    onUploadProgress: (e) => {
      if (!e.total) return;

      const percent = Math.round((e.loaded / e.total) * 100);
      percentListen?.(percent);
    },
    headers: {
      'Content-Type': 'multipart/form-data; charset=utf-8'
    }
  });
};
export const postTemplateDatasetCollection = ({
  file,
  percentListen,
  datasetId
}: {
  file: File;
  percentListen: (percent: number) => void;
  datasetId: string;
}) => {
  const formData = new FormData();
  formData.append('file', file, encodeURIComponent(file.name));
  formData.append('data', JSON.stringify({ datasetId }));

  return POST(`/core/dataset/collection/create/template`, formData, {
    timeout: 600000,
    onUploadProgress: (e) => {
      if (!e.total) return;

      const percent = Math.round((e.loaded / e.total) * 100);
      percentListen?.(percent);
    },
    headers: {
      'Content-Type': 'multipart/form-data; charset=utf-8'
    }
  });
};

/* =========== search test ============ */
export const postSearchText = (data: SearchTestProps) =>
  POST<SearchTestResponse>(`/core/dataset/searchTest`, data);

/* ============================= collections ==================================== */
export const getDatasetCollections = (data: GetDatasetCollectionsProps) =>
  POST<PaginationResponse<DatasetCollectionsListItemType>>(`/core/dataset/collection/listV2`, data);
export const getDatasetCollectionPathById = (parentId: string) =>
  GET<ParentTreePathItemType[]>(`/core/dataset/collection/paths`, { parentId });
export const getDatasetCollectionById = (id: string) =>
  GET<DatasetCollectionItemType>(`/core/dataset/collection/detail`, { id });
export const getDatasetCollectionTrainingDetail = (collectionId: string) =>
  GET<getTrainingDetailResponse>(`/core/dataset/collection/trainingDetail`, {
    collectionId
  });
export const postDatasetCollection = (data: CreateDatasetCollectionParams) =>
  POST<string>(`/core/dataset/collection/create`, data);
export const postCreateDatasetFileCollection = (data: FileIdCreateDatasetCollectionParams) =>
  POST<{ collectionId: string }>(`/core/dataset/collection/create/fileId`, data, {
    timeout: 360000
  });
export const postReTrainingDatasetFileCollection = (data: reTrainingDatasetFileCollectionParams) =>
  POST<{ collectionId: string }>(`/core/dataset/collection/create/reTrainingCollection`, data, {
    timeout: 360000
  });
export const postCreateDatasetLinkCollection = (data: LinkCreateDatasetCollectionParams) =>
  POST<{ collectionId: string }>(`/core/dataset/collection/create/link`, data);
export const postCreateDatasetTextCollection = (data: TextCreateDatasetCollectionParams) =>
  POST<{ collectionId: string }>(`/core/dataset/collection/create/text`, data);

export const postCreateDatasetExternalFileCollection = (
  data: ExternalFileCreateDatasetCollectionParams
) =>
  POST<{ collectionId: string }>(`/proApi/core/dataset/collection/create/externalFileUrl`, data, {
    timeout: 360000
  });
export const postCreateDatasetApiDatasetCollection = (
  data: ApiDatasetCreateDatasetCollectionParams
) =>
  POST<{ collectionId: string }>(`/core/dataset/collection/create/apiCollection`, data, {
    timeout: 360000
  });

export const putDatasetCollectionById = (data: UpdateDatasetCollectionParams) =>
  POST(`/core/dataset/collection/update`, data);
export const delDatasetCollectionById = (params: { id: string }) =>
  DELETE(`/core/dataset/collection/delete`, params);
export const postLinkCollectionSync = (collectionId: string) =>
  POST<DatasetCollectionSyncResultEnum>(`/core/dataset/collection/sync`, {
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

/* =============================== data ==================================== */
/* get dataset list */
export const getDatasetDataList = (data: GetDatasetDataListProps) =>
  POST<GetDatasetDataListRes>(`/core/dataset/data/v2/list`, data);

export const getDatasetDataPermission = (id?: string) =>
  GET<GetQuotePermissionResponse>(`/core/dataset/data/getPermission`, { id });

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

// Get quote data
export const getQuoteData = (data: GetQuoteDataProps) =>
  POST<GetQuoteDataResponse>(`/core/dataset/data/getQuoteData`, data);

/* ================ training ==================== */
export const postRebuildEmbedding = (data: rebuildEmbeddingBody) =>
  POST(`/core/dataset/training/rebuildEmbedding`, data);

/* get length of system training queue */
export const getTrainingQueueLen = () =>
  GET<GetQueueLenResponse>(`/core/dataset/training/getQueueLen`);
export const getDatasetTrainingQueue = (datasetId: string) =>
  GET<getDatasetTrainingQueueResponse>(`/core/dataset/training/getDatasetTrainingQueue`, {
    datasetId
  });

export const getPreviewChunks = (data: PostPreviewFilesChunksProps) =>
  POST<PreviewChunksResponse>('/core/dataset/file/getPreviewChunks', data, {
    maxQuantity: 1,
    timeout: 600000
  });

export const deleteTrainingData = (data: deleteTrainingDataBody) =>
  POST(`/core/dataset/training/deleteTrainingData`, data);
export const updateTrainingData = (data: updateTrainingDataBody) =>
  PUT(`/core/dataset/training/updateTrainingData`, data);
export const getTrainingDataDetail = (data: getTrainingDataDetailBody) =>
  POST<getTrainingDataDetailResponse>(`/core/dataset/training/getTrainingDataDetail`, data);
export const getTrainingError = (data: getTrainingErrorBody) =>
  POST<getTrainingErrorResponse>(`/core/dataset/training/getTrainingError`, data);

/* ================== read source ======================== */
export const getCollectionSource = (data: readCollectionSourceBody) =>
  POST<readCollectionSourceResponse>('/core/dataset/collection/read', data);

/* ================== apiDataset ======================== */
export const getApiDatasetFileList = (data: GetApiDatasetFileListProps) =>
  POST<APIFileItem[]>('/core/dataset/apiDataset/list', data);
export const getApiDatasetFileListExistId = (data: listExistIdQuery) =>
  GET<listExistIdResponse>('/core/dataset/apiDataset/listExistId', data);

export const getApiDatasetCatalog = (data: GetApiDatasetCataLogProps) =>
  POST<GetApiDatasetCataLogResponse>('/core/dataset/apiDataset/getCatalog', data);

export const getApiDatasetPaths = (data: GetApiDatasetPathBody) =>
  POST<GetApiDatasetPathResponse>('/core/dataset/apiDataset/getPathNames', data);
