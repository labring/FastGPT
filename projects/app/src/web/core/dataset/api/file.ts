import { POST } from '@/web/common/api/request';
import type {
  GetSearchTestImagePreviewUrlsBody,
  GetSearchTestImagePreviewUrlsResponse,
  GetPreviewChunksBody,
  GetPreviewChunksResponse,
  PresignDatasetFilePostUrlBody,
  PresignDatasetFilePostUrlResponse,
  UploadSearchTestImageResponse
} from '@fastgpt/global/openapi/core/dataset/file/api';
import type { CreatePostPresignedUrlResponseType } from '@fastgpt/global/common/file/s3/type';

export const getUploadDatasetFilePresignedUrl = (params: PresignDatasetFilePostUrlBody) =>
  POST<CreatePostPresignedUrlResponseType>('/core/dataset/file/presignDatasetFilePostUrl', params);

export const getPreviewChunks = (data: GetPreviewChunksBody) =>
  POST<GetPreviewChunksResponse>('/core/dataset/file/getPreviewChunks', data, {
    maxQuantity: 1,
    timeout: 600000
  });

export const postUploadSearchTestImage = (data: FormData) =>
  POST<UploadSearchTestImageResponse>('/core/dataset/file/uploadSearchTestImage', data);

export const postGetSearchTestImagePreviewUrls = (data: GetSearchTestImagePreviewUrlsBody) =>
  POST<GetSearchTestImagePreviewUrlsResponse>(
    '/core/dataset/file/getSearchTestImagePreviewUrls',
    data
  );
