import { GET, POST, PUT, DELETE } from '@/web/common/api/request';
import type { DatasetDataItemType } from '@fastgpt/global/core/dataset/type';
import type {
  GetDatasetDataListBody as GetDatasetDataListProps,
  GetDatasetDataListResponse as GetDatasetDataListRes,
  GetQuoteDataBody as GetQuoteDataProps,
  GetQuoteDataResponse,
  InsertDataBody,
  UpdateDatasetDataBody
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
  PUT('/core/dataset/data/update', data);

/**
 * 删除一条知识库数据
 */
export const delOneDatasetDataById = (id: string) =>
  DELETE<string>(`/core/dataset/data/delete`, { id });

// Get quote data
export const getQuoteData = (data: GetQuoteDataProps) =>
  POST<GetQuoteDataResponse>(`/core/dataset/data/getQuoteData`, data);
