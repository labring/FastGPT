import { GET, POST, PUT, DELETE } from '@/web/common/api/request';
import type { DatasetDataItemType } from '@fastgpt/global/core/dataset/type';
import type {
  GetDatasetDataListBody as GetDatasetDataListProps,
  GetDatasetDataListResponse as GetDatasetDataListRes,
  GetQuoteDataBody as GetQuoteDataProps,
  GetQuoteDataResponse,
  InsertDataBody,
  CreateDatasetDataIndexBody,
  DeleteDatasetDataIndexBody,
  DeleteDatasetDataIndexResponse,
  DatasetDataIndexResponse,
  UpdateDatasetDataIndexBody,
  UpdateDatasetDataBody,
  UpdateDatasetDataResponse
} from '@fastgpt/global/openapi/core/dataset/data/api';

export const getDatasetDataList = (data: GetDatasetDataListProps) =>
  POST<GetDatasetDataListRes>(`/core/dataset/data/v2/list`, data);

export const getDatasetDataItemById = (id: string) =>
  GET<DatasetDataItemType>(`/core/dataset/data/detail`, { id });

/**
 * insert one data to dataset (immediately insert)
 */
export const postInsertData2Dataset = (data: InsertDataBody) =>
  POST<string>(`/core/dataset/data/insertData`, data);

/**
 * update one datasetData by id
 */
export const putDatasetDataById = (data: UpdateDatasetDataBody) =>
  PUT<UpdateDatasetDataResponse>('/core/dataset/data/update', data);

export const createDatasetDataIndex = (data: CreateDatasetDataIndexBody) =>
  POST<DatasetDataIndexResponse>('/core/dataset/data/index/create', data);

export const updateDatasetDataIndex = (data: UpdateDatasetDataIndexBody) =>
  POST<DatasetDataIndexResponse>('/core/dataset/data/index/update', data);

/**
 * 删除一条知识库数据
 */
export const delOneDatasetDataById = (id: string) =>
  DELETE<string>(`/core/dataset/data/delete`, { id });

export const deleteDatasetDataIndex = (data: DeleteDatasetDataIndexBody) =>
  POST<DeleteDatasetDataIndexResponse>('/core/dataset/data/index/delete', data);

// Get quote data
export const getQuoteData = (data: GetQuoteDataProps) =>
  POST<GetQuoteDataResponse>(`/core/dataset/data/getQuoteData`, data);
