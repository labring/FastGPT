import { POST } from '@/web/common/api/request';
import type { ImageCreateDatasetCollectionParams } from '@fastgpt/global/core/dataset/api';

export const createImageDatasetCollection = async ({
  files,
  onUploadProgress,
  ...data
}: ImageCreateDatasetCollectionParams & {
  onUploadProgress?: (e: number) => void;
  files: File[];
}) => {
  const formData = new FormData();
  files.forEach((file) => {
    formData.append('file', file, encodeURIComponent(file.name));
  });
  formData.append('data', JSON.stringify(data));

  return await POST<{ collectionId: string }>('/core/dataset/collection/create/images', formData, {
    timeout: 600000,
    headers: {
      'Content-Type': 'multipart/form-data; charset=utf-8'
    },
    onUploadProgress: (e) => {
      if (!onUploadProgress) return;
      if (!e.progress) {
        return onUploadProgress(0);
      }
      const percent = +Math.round(e.progress * 100).toFixed(2);
      onUploadProgress(percent);
    }
  });
};

export const insertImagesToCollection = async ({
  files,
  collectionId,
  onUploadProgress
}: {
  onUploadProgress?: (e: number) => void;
  files: File[];
  collectionId: string;
}) => {
  const formData = new FormData();
  files.forEach((file) => {
    formData.append('file', file, encodeURIComponent(file.name));
  });
  formData.append('data', JSON.stringify({ collectionId }));

  return await POST<{ collectionId: string }>('/core/dataset/data/insertImages', formData, {
    timeout: 600000,
    headers: {
      'Content-Type': 'multipart/form-data; charset=utf-8'
    },
    onUploadProgress: (e) => {
      if (!onUploadProgress) return;
      if (!e.progress) {
        return onUploadProgress(0);
      }
      const percent = +Math.round(e.progress * 100).toFixed(2);
      onUploadProgress(percent);
    }
  });
};
