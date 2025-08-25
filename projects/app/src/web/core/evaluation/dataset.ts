import { DELETE, GET, POST, PUT } from '@/web/common/api/request';
import type {
  CreateDatasetParams,
  UpdateDatasetParams,
  EvalDatasetSchemaType,
  ImportResult
} from '@fastgpt/global/core/evaluation/type';
import type { PaginationResponse, PaginationProps } from '@fastgpt/web/common/fetch/type';

// ==================== 数据集管理 API ====================

export const createDataset = (data: CreateDatasetParams) =>
  POST<EvalDatasetSchemaType>('/core/evaluation/dataset/create', data);

export const getDatasetList = (
  data: PaginationProps<{
    searchKey?: string;
  }>
) => POST<PaginationResponse<EvalDatasetSchemaType>>('/core/evaluation/dataset/list', data);

export const getDatasetDetail = (datasetId: string) =>
  GET<EvalDatasetSchemaType>(`/core/evaluation/dataset/detail?id=${datasetId}`);

export const updateDataset = (datasetId: string, data: UpdateDatasetParams) =>
  PUT<EvalDatasetSchemaType>(`/core/evaluation/dataset/update?id=${datasetId}`, data);

export const deleteDataset = (datasetId: string) =>
  DELETE(`/core/evaluation/dataset/delete?id=${datasetId}`);

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
