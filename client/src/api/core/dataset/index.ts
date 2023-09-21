import { GET, POST, PUT, DELETE } from '@/api/request';
import type { DatasetItemType, DatasetsItemType, DatasetPathItemType } from '@/types/core/dataset';
import type {
  DatasetUpdateParams,
  CreateDatasetParams,
  SearchTestProps,
  SearchTestResponseType
} from './index.d';
import { KbTypeEnum } from '@/constants/dataset';

export const getDatasets = (data: { parentId?: string; type?: `${KbTypeEnum}` }) =>
  GET<DatasetsItemType[]>(`/core/dataset/list`, data);

/**
 * get type=dataset list
 */
export const getAllDataset = () => GET<DatasetsItemType[]>(`/core/dataset/allDataset`);

export const getDatasetPaths = (parentId?: string) =>
  GET<DatasetPathItemType[]>('/core/dataset/paths', { parentId });

export const getDatasetById = (id: string) => GET<DatasetItemType>(`/core/dataset/detail?id=${id}`);

export const postCreateDataset = (data: CreateDatasetParams) =>
  POST<string>(`/core/dataset/create`, data);

export const putDatasetById = (data: DatasetUpdateParams) => PUT(`/core/dataset/update`, data);

export const delDatasetById = (id: string) => DELETE(`/core/dataset/delete?id=${id}`);

export const postSearchText = (data: SearchTestProps) =>
  POST<SearchTestResponseType>(`/core/dataset/searchTest`, data);
