import { GET, POST } from '@/web/common/api/request';
import type {
  GetApiDatasetCatalogBody,
  GetApiDatasetCatalogResponse,
  GetApiDatasetFileListBody,
  GetApiDatasetFileListExistIdQuery,
  GetApiDatasetFileListExistIdResponse,
  GetApiDatasetFileListResponse,
  GetApiDatasetPathNamesBody,
  GetApiDatasetPathNamesResponse
} from '@fastgpt/global/openapi/core/dataset/apiDataset/api';

export const getApiDatasetFileList = (data: GetApiDatasetFileListBody) =>
  POST<GetApiDatasetFileListResponse>('/core/dataset/apiDataset/list', data);

export const getApiDatasetFileListExistId = (data: GetApiDatasetFileListExistIdQuery) =>
  GET<GetApiDatasetFileListExistIdResponse>('/core/dataset/apiDataset/listExistId', data);

export const getApiDatasetCatalog = (data: GetApiDatasetCatalogBody) =>
  POST<GetApiDatasetCatalogResponse>('/core/dataset/apiDataset/getCatalog', data);

export const getApiDatasetPaths = (data: GetApiDatasetPathNamesBody) =>
  POST<GetApiDatasetPathNamesResponse>('/core/dataset/apiDataset/getPathNames', data);
