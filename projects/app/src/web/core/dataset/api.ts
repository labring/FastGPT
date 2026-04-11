import { GET, POST, PUT, DELETE } from '@/web/common/api/request';
import type {
  GetPathProps,
  ParentTreePathItemType
} from '@fastgpt/global/common/parentFolder/type';
import type {
  DatasetItemType,
  DatasetListItemType,
  DatasetSimpleItemType,
  DatasetTagType,
  TagUsageType
} from '@fastgpt/global/core/dataset/type';
import type { GetDatasetCollectionsProps } from '@/global/core/api/datasetReq';
import type {
  AddTagsToCollectionsParams,
  ApiDatasetCreateDatasetCollectionV2Params,
  CreateDatasetCollectionParams,
  CreateDatasetCollectionTagParams,
  ExternalFileCreateDatasetCollectionParams,
  FileIdCreateDatasetCollectionParams,
  reTrainingDatasetFileCollectionParams,
  LinkCreateDatasetCollectionParams,
  PostDatasetSyncParams,
  TextCreateDatasetCollectionParams,
  UpdateDatasetCollectionTagParams
} from '@fastgpt/global/core/dataset/api';
import type {
  CreateDatasetBody,
  CreateDatasetWithFilesBody,
  CreateDatasetWithFilesResponse,
  GetDatasetListBody,
  UpdateDatasetBody,
  CreateDatasetFolderBody,
  SearchDatasetTestBody,
  SearchDatasetTestResponse
} from '@fastgpt/global/openapi/core/dataset/api';
import type { DatasetCollectionItemType } from '@fastgpt/global/core/dataset/type';
import type { DatasetCollectionSyncResultEnum } from '@fastgpt/global/core/dataset/constants';
import type { DatasetCollectionsListItemType } from '@/global/core/dataset/type';
import type {
  readCollectionSourceBody,
  readCollectionSourceResponse
} from '@/pages/api/core/dataset/collection/read';
import type { UpdateDatasetCollectionBodyType } from '@fastgpt/global/openapi/core/dataset/collection/api';
import type { PaginationProps, PaginationResponse } from '@fastgpt/global/openapi/api';
import type { getTrainingDetailResponse } from '@/pages/api/core/dataset/collection/trainingDetail';
import type { DelCollectionBody } from '@/pages/api/core/dataset/collection/delete';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';

/* ======================== dataset ======================= */
export const getDatasets = (data: GetDatasetListBody) =>
  POST<DatasetListItemType[]>(`/core/dataset/list`, data, { maxQuantity: 1 });

export const getDatasetsByAppIdAndDatasetIds = (data: { appId: string; datasetIdList: string[] }) =>
  POST<DatasetSimpleItemType[]>(`/core/dataset/listByAppIdAndDatasetIds`, data);

export const getDatasetPaths = (data: GetPathProps) => {
  if (!data.sourceId) return Promise.resolve([]);
  return GET<ParentTreePathItemType[]>('/core/dataset/paths', data);
};

export const getDatasetById = (id: string) => GET<DatasetItemType>(`/core/dataset/detail?id=${id}`);

export const postCreateDataset = (data: CreateDatasetBody) =>
  POST<string>(`/core/dataset/create`, data);

export const postCreateDatasetWithFiles = (data: CreateDatasetWithFilesBody) =>
  POST<CreateDatasetWithFilesResponse>(`/core/dataset/createWithFiles`, data);

export const putDatasetById = (data: UpdateDatasetBody) => PUT<void>(`/core/dataset/update`, data);

export const delDatasetById = (id: string) => DELETE(`/core/dataset/delete?id=${id}`);

export const postDatasetSync = (data: PostDatasetSyncParams) =>
  POST(`/proApi/core/dataset/datasetSync`, data, {
    timeout: 600000
  }).catch();

export const postCreateDatasetFolder = (data: CreateDatasetFolderBody) =>
  POST(`/core/dataset/folder/create`, data);

export const resumeInheritPer = (datasetId: string) =>
  PUT(`/core/dataset/resumeInheritPermission`, { datasetId });

export const postChangeOwner = (data: { ownerId: string; datasetId: string }) =>
  POST(`/proApi/core/dataset/changeOwner`, data);

/* ============================= collection ==================================== */
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
    }
  });
};

/* =========== search test ============ */
export const postSearchText = (data: SearchDatasetTestBody) =>
  POST<SearchDatasetTestResponse>(`/core/dataset/searchTest`, data);

/* ============================= collections ==================================== */
export const getDatasetCollections = (data: GetDatasetCollectionsProps) =>
  POST<PaginationResponse<DatasetCollectionsListItemType>>(`/core/dataset/collection/listV2`, data);
export const getDatasetCollectionPathById = (parentId: ParentIdType) =>
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
  data: ApiDatasetCreateDatasetCollectionV2Params
) =>
  POST(`/core/dataset/collection/create/apiCollectionV2`, data, {
    timeout: 360000
  });

export const putDatasetCollectionById = (data: UpdateDatasetCollectionBodyType) =>
  POST(`/core/dataset/collection/update`, data);
export const delDatasetCollectionById = (params: DelCollectionBody) =>
  POST(`/core/dataset/collection/delete`, params);
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

/* ================== read source ======================== */
export const getCollectionSource = (data: readCollectionSourceBody) =>
  POST<readCollectionSourceResponse>('/core/dataset/collection/read', data);
