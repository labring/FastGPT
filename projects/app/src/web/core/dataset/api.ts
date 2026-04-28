import { GET, POST, PUT, DELETE } from '@/web/common/api/request';
import type {
  GetPathProps,
  ParentTreePathItemType
} from '@fastgpt/global/common/parentFolder/type';
import type {
  DatasetItemType,
  DatasetListItemType,
  DatasetSimpleItemType
} from '@fastgpt/global/core/dataset/type';
import type { PostDatasetSyncParams } from '@fastgpt/global/openapi/core/dataset/api';
import type {
  CreateDatasetBody,
  CreateDatasetWithFilesBody,
  CreateDatasetWithFilesResponse,
  GetDatasetListBody,
  UpdateDatasetBody,
  CreateDatasetFolderBody,
  SearchDatasetTestBody,
  SearchDatasetTestResponse,
  GetDatasetPermissionResponse
} from '@fastgpt/global/openapi/core/dataset/api';

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
  });

export const postCreateDatasetFolder = (data: CreateDatasetFolderBody) =>
  POST(`/core/dataset/folder/create`, data);

export const getDatasetPermission = (id?: string) =>
  GET<GetDatasetPermissionResponse>(`/core/dataset/getPermission`, { id });

export const resumeInheritPer = (datasetId: string) =>
  PUT(`/core/dataset/resumeInheritPermission`, { datasetId });

export const postChangeOwner = (data: { ownerId: string; datasetId: string }) =>
  POST(`/proApi/core/dataset/changeOwner`, data);

/* =========== search test ============ */
export const postSearchText = (data: SearchDatasetTestBody) =>
  POST<SearchDatasetTestResponse>(`/core/dataset/searchTest`, data);
