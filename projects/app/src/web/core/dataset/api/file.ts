import { POST } from '@/web/common/api/request';
import type {
  GetSearchTestImagePreviewUrlsBody,
  GetSearchTestImagePreviewUrlsResponse,
  GetPreviewChunksBody,
  GetPreviewChunksResponse,
  GetRawTextPreviewChunksBody,
  GetRawTextPreviewChunksResponse,
  PresignDatasetFilePostUrlBody,
  PresignDatasetFilePostUrlResponse,
  PresignSearchTestImageBody,
  PresignSearchTestImageResponse
} from '@fastgpt/global/openapi/core/dataset/file/api';

export const getUploadDatasetFilePresignedUrl = (
  params: PresignDatasetFilePostUrlBody,
  config?: Parameters<typeof POST>[2]
) =>
  POST<PresignDatasetFilePostUrlResponse>(
    '/core/dataset/file/presignDatasetFilePostUrl',
    params,
    config
  );

export const getPreviewChunks = (data: GetPreviewChunksBody) =>
  POST<GetPreviewChunksResponse>('/core/dataset/file/getPreviewChunks', data, {
    maxQuantity: 1,
    timeout: 600000
  });

export const getRawTextPreviewChunks = (data: GetRawTextPreviewChunksBody) =>
  POST<GetRawTextPreviewChunksResponse>('/core/dataset/file/getRawTextPreviewChunks', data, {
    maxQuantity: 1,
    timeout: 600000
  });

export const getUploadSearchTestImagePresignedUrl = (data: PresignSearchTestImageBody) =>
  POST<PresignSearchTestImageResponse>('/core/dataset/file/presignSearchTestImage', data);

export const postGetSearchTestImagePreviewUrls = (data: GetSearchTestImagePreviewUrlsBody) =>
  POST<GetSearchTestImagePreviewUrlsResponse>(
    '/core/dataset/file/getSearchTestImagePreviewUrls',
    data
  );
