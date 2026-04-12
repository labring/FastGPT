import { GET, POST, PUT, DELETE } from '@/web/common/api/request';
import type {
  ParentTreePathItemType,
  ParentIdType
} from '@fastgpt/global/common/parentFolder/type';
import type {
  DatasetCollectionItemType,
  DatasetTagType,
  TagUsageType
} from '@fastgpt/global/core/dataset/type';
import type { GetDatasetCollectionsProps } from '@/global/core/api/datasetReq';
import type {
  CreateApiCollectionV2BodyType,
  ExternalFileCreateDatasetCollectionParams,
  CreateCollectionByFileIdBodyType,
  ReTrainingCollectionBodyType,
  CreateLinkCollectionBodyType,
  CreateTextCollectionBodyType,
  CreateCollectionBodyType
} from '@fastgpt/global/openapi/core/dataset/collection/createApi';
import type {
  AddTagsToCollectionsParams,
  CreateDatasetCollectionTagParams,
  UpdateDatasetCollectionTagParams
} from '@fastgpt/global/openapi/core/dataset/collection/tagApi';
import type { DatasetCollectionSyncResultEnum } from '@fastgpt/global/core/dataset/constants';
import type {
  DatasetCollectionsListItemType,
  DeleteCollectionBodyType,
  ReadCollectionSourceBodyType,
  ReadCollectionSourceResponseType,
  UpdateDatasetCollectionBodyType
} from '@fastgpt/global/openapi/core/dataset/collection/api';
import type { PaginationProps, PaginationResponse } from '@fastgpt/global/openapi/api';
import type { GetCollectionTrainingDetailResponseType } from '@fastgpt/global/openapi/core/dataset/collection/api';

/* ============================= collections ==================================== */
export const getDatasetCollections = (data: GetDatasetCollectionsProps) =>
  POST<PaginationResponse<DatasetCollectionsListItemType>>(`/core/dataset/collection/listV2`, data);
export const getDatasetCollectionPathById = (sourceId: ParentIdType) =>
  GET<ParentTreePathItemType[]>(`/core/dataset/collection/paths`, { sourceId });
export const getDatasetCollectionById = (id: string) =>
  GET<DatasetCollectionItemType>(`/core/dataset/collection/detail`, { id });
export const putDatasetCollectionById = (data: UpdateDatasetCollectionBodyType) =>
  POST(`/core/dataset/collection/update`, data);
export const delDatasetCollectionById = (params: DeleteCollectionBodyType) =>
  POST(`/core/dataset/collection/delete`, params);
export const postLinkCollectionSync = (collectionId: string) =>
  POST<DatasetCollectionSyncResultEnum>(`/core/dataset/collection/sync`, {
    collectionId
  });

export const getDatasetCollectionTrainingDetail = (collectionId: string) =>
  GET<GetCollectionTrainingDetailResponseType>(`/core/dataset/collection/trainingDetail`, {
    collectionId
  });

/* ========================== collection create ========================== */
export const postDatasetCollection = (data: CreateCollectionBodyType) =>
  POST<string>(`/core/dataset/collection/create`, data);
export const postCreateDatasetFileCollection = (data: CreateCollectionByFileIdBodyType) =>
  POST<{ collectionId: string }>(`/core/dataset/collection/create/fileId`, data, {
    timeout: 360000
  });
export const postReTrainingDatasetFileCollection = (data: ReTrainingCollectionBodyType) =>
  POST<{ collectionId: string }>(`/core/dataset/collection/create/reTrainingCollection`, data, {
    timeout: 360000
  });
export const postCreateDatasetLinkCollection = (data: CreateLinkCollectionBodyType) =>
  POST<{ collectionId: string }>(`/core/dataset/collection/create/link`, data);
export const postCreateDatasetTextCollection = (data: CreateTextCollectionBodyType) =>
  POST<{ collectionId: string }>(`/core/dataset/collection/create/text`, data);
export const postCreateDatasetApiDatasetCollection = (data: CreateApiCollectionV2BodyType) =>
  POST(`/core/dataset/collection/create/apiCollectionV2`, data, {
    timeout: 360000
  });
/** @deprecated */
export const postCreateDatasetExternalFileCollection = (
  data: ExternalFileCreateDatasetCollectionParams
) =>
  POST<{ collectionId: string }>(`/proApi/core/dataset/collection/create/externalFileUrl`, data, {
    timeout: 360000
  });

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
export const getCollectionSource = (data: ReadCollectionSourceBodyType) =>
  POST<ReadCollectionSourceResponseType>('/core/dataset/collection/read', data);
