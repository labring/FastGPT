import type {
  PostPreviewFilesChunksProps,
  PreviewChunksResponse
} from '@/pages/api/core/dataset/file/getPreviewChunks';
import { POST } from '@/web/common/api/request';
import type { CreatePostPresignedUrlResult } from '@fastgpt/service/common/s3/type';

export const getUploadDatasetFilePresignedUrl = (params: {
  filename: string;
  datasetId: string;
}) => {
  return POST<CreatePostPresignedUrlResult>('/core/dataset/file/presignDatasetFilePostUrl', params);
};

export const getPreviewChunks = (data: PostPreviewFilesChunksProps) =>
  POST<PreviewChunksResponse>('/core/dataset/file/getPreviewChunks', data, {
    maxQuantity: 1,
    timeout: 600000
  });
