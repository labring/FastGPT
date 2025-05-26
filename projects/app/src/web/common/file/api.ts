import { GET, POST } from '@/web/common/api/request';
import type { UploadImgProps } from '@fastgpt/global/common/file/api.d';
import { type AxiosProgressEvent } from 'axios';

export const postUploadImg = (e: UploadImgProps) => POST<string>('/common/file/uploadImage', e);

export const postUploadFiles = (
  data: FormData,
  onUploadProgress: (progressEvent: AxiosProgressEvent) => void
) =>
  POST<{
    fileId: string;
    previewUrl: string;
  }>('/common/file/upload', data, {
    timeout: 600000,
    onUploadProgress,
    headers: {
      'Content-Type': 'multipart/form-data; charset=utf-8'
    }
  });

/**
 * Get file access token
 */
export const postGetFileToken = (data: {
  bucketName: string;
  fileId: string;
  datasetId?: string;
  teamId?: string;
  expireMinutes?: number;
}) => {
  // Filter out undefined values but keep empty strings
  const filteredData = Object.fromEntries(
    Object.entries(data).filter(([_, value]) => value !== undefined)
  );

  return POST('/common/file/token', filteredData, {
    timeout: 10000
  });
};

export const generateImagePreviewUrl = async (
  imageId: string,
  datasetId: string,
  teamId?: string,
  scene: 'list' | 'chat' | 'preview' = 'list'
) => {
  try {
    if (!imageId) {
      throw new Error('imageId is required');
    }

    if (!datasetId) {
      throw new Error('datasetId is required');
    }

    // Set different expiration times based on scene
    const expireMinutes = scene === 'chat' ? 7 * 24 * 60 : 30;

    const tokenData = {
      bucketName: 'dataset',
      fileId: imageId,
      datasetId,
      teamId,
      expireMinutes
    };

    const token = await postGetFileToken(tokenData);

    const timestamp = Date.now();
    const url = `/api/core/dataset/image/${imageId}?token=${token}&t=${timestamp}`;

    return url;
  } catch (error) {
    return '';
  }
};
