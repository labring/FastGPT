import { DELETE, GET, POST, PUT } from '@/web/common/api/request';
import type {
  CreateDatasetRequest,
  CreateDatasetResponse,
  ListDatasetsRequest,
  ListDatasetsResponse,
  DatasetDetailResponse,
  UpdateDatasetRequest,
  UpdateDatasetResponse,
  DeleteDatasetResponse
} from '@fastgpt/global/core/evaluation/api';
import type { ImportResult } from '@fastgpt/global/core/evaluation/type';
// ==================== 数据集管理 API ====================

export const createDataset = (data: CreateDatasetRequest) =>
  POST<CreateDatasetResponse>('/core/evaluation/dataset/create', data);

export const getDatasetList = (data: ListDatasetsRequest) =>
  POST<ListDatasetsResponse>('/core/evaluation/dataset/list', data);

export const getDatasetDetail = (datasetId: string) =>
  GET<DatasetDetailResponse>(`/core/evaluation/dataset/detail?datasetId=${datasetId}`);

export const updateDataset = (data: UpdateDatasetRequest) =>
  PUT<UpdateDatasetResponse>('/core/evaluation/dataset/update', data);

export const deleteDataset = (datasetId: string) =>
  DELETE<DeleteDatasetResponse>(`/core/evaluation/dataset/delete?datasetId=${datasetId}`);

export const importDataset = ({
  datasetId,
  file,
  percentListen
}: {
  datasetId: string;
  file: File;
  percentListen?: (percent: number) => void;
}) => {
  const formData = new FormData();
  formData.append('file', file, encodeURIComponent(file.name));
  formData.append('datasetId', datasetId);

  return POST<ImportResult>('/core/evaluation/dataset/import', formData, {
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
