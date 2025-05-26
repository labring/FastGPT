import { GET, POST, DELETE } from '@/web/common/api/request';
import { type AxiosProgressEvent } from 'axios';

export const uploadDatasetImage = (
  file: File,
  data: {
    datasetId: string;
    collectionId?: string;
  },
  onProgress?: (percent: number) => void
) => {
  const formData = new FormData();
  formData.append('file', file, encodeURIComponent(file.name));
  formData.append('data', JSON.stringify(data));

  return POST<{
    id: string;
  }>('/core/dataset/image/upload', formData, {
    timeout: 600000,
    onUploadProgress: (e) => {
      if (!e.total) return;
      const percent = Math.round((e.loaded / e.total) * 100);
      onProgress?.(percent);
    },
    headers: {
      'Content-Type': 'multipart/form-data; charset=utf-8'
    }
  });
};
