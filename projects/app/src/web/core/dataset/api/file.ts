import { POST } from '@/web/common/api/request';
import type {
  GetPreviewChunksBody,
  GetPreviewChunksResponse,
  PresignDatasetFilePostUrlBody
} from '@fastgpt/global/openapi/core/dataset/file/api';
import type { CreatePostPresignedUrlResponseType } from '@fastgpt/global/common/file/s3/type';

export const getUploadDatasetFilePresignedUrl = (params: PresignDatasetFilePostUrlBody) =>
  POST<CreatePostPresignedUrlResponseType>('/core/dataset/file/presignDatasetFilePostUrl', params);

export const getPreviewChunks = (data: GetPreviewChunksBody) =>
  POST<GetPreviewChunksResponse>('/core/dataset/file/getPreviewChunks', data, {
    maxQuantity: 1,
    timeout: 600000
  });
