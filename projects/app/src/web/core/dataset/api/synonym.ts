import { DELETE, GET, POST } from '@/web/common/api/request';
import type {
  DatasetSynonymMutationResponse,
  DatasetSynonymJobActionResponse,
  DeleteDatasetSynonymResponse,
  GetDatasetSynonymDetailResponse,
  SearchDatasetSynonymMappingsResponse,
  UpdateDatasetSynonymBody,
  UploadDatasetSynonymBody
} from '@fastgpt/global/openapi/core/dataset/synonym/api';

export const getDatasetSynonymDetail = (datasetId: string) =>
  GET<GetDatasetSynonymDetailResponse>('/core/dataset/synonym/detail', { datasetId });

export const uploadDatasetSynonym = (body: UploadDatasetSynonymBody) =>
  POST<DatasetSynonymMutationResponse>('/core/dataset/synonym/upload', body);

export const updateDatasetSynonym = (body: UpdateDatasetSynonymBody) =>
  POST<DatasetSynonymMutationResponse>('/core/dataset/synonym/update', body);

const createSynonymFileForm = ({ file, data }: { file: File; data: Record<string, string> }) => {
  const form = new FormData();
  form.append('file', file, encodeURIComponent(file.name));
  form.append('data', JSON.stringify(data));
  return form;
};

export const uploadDatasetSynonymFile = ({
  datasetId,
  file,
  onProgress
}: {
  datasetId: string;
  file: File;
  onProgress?: (percent: number) => void;
}) =>
  POST<DatasetSynonymMutationResponse>(
    '/core/dataset/synonym/uploadFile',
    createSynonymFileForm({ file, data: { datasetId } }),
    {
      timeout: 600000,
      onUploadProgress: ({ loaded, total }) =>
        onProgress?.(total ? Math.round((loaded / total) * 100) : 0)
    }
  );

export const updateDatasetSynonymFile = ({
  datasetId,
  oldSynonymId,
  file,
  onProgress
}: {
  datasetId: string;
  oldSynonymId: string;
  file: File;
  onProgress?: (percent: number) => void;
}) =>
  POST<DatasetSynonymMutationResponse>(
    '/core/dataset/synonym/updateFile',
    createSynonymFileForm({ file, data: { datasetId, oldSynonymId } }),
    {
      timeout: 600000,
      onUploadProgress: ({ loaded, total }) =>
        onProgress?.(total ? Math.round((loaded / total) * 100) : 0)
    }
  );

export const deleteDatasetSynonym = (id: string) =>
  DELETE<DeleteDatasetSynonymResponse>('/core/dataset/synonym/delete', { id });

export const searchDatasetSynonymMappings = (params: {
  datasetId: string;
  search?: string;
  pageNum?: number;
  pageSize?: number;
}) => POST<SearchDatasetSynonymMappingsResponse>('/core/dataset/synonym/mappings', params);

export const retryDatasetSynonymJob = (jobId: string) =>
  POST<DatasetSynonymMutationResponse>('/core/dataset/synonym/retry', { jobId });

export const cancelDatasetSynonymJob = (jobId: string) =>
  POST<DatasetSynonymJobActionResponse>('/core/dataset/synonym/cancel', { jobId });
