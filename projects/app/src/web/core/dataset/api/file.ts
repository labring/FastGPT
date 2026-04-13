import { POST } from '@/web/common/api/request';
import type {
  GetPreviewChunksBody,
  GetPreviewChunksResponse,
  PresignDatasetFilePostUrlBody,
  PresignDatasetFilePostUrlResponse
} from '@fastgpt/global/openapi/core/dataset/file/api';

export const getUploadDatasetFilePresignedUrl = (params: PresignDatasetFilePostUrlBody) =>
  POST<PresignDatasetFilePostUrlResponse>('/core/dataset/file/presignDatasetFilePostUrl', params);

export const getPreviewChunks = (data: GetPreviewChunksBody) =>
  POST<GetPreviewChunksResponse>('/core/dataset/file/getPreviewChunks', data, {
    maxQuantity: 1,
    timeout: 600000
  });
