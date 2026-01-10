import { POST, PUT } from '@/web/common/api/request';
import type {
  PresignChatFileGetUrlParams,
  PresignChatFilePostUrlParams
} from '@fastgpt/global/openapi/core/chat/controler/api';
import type { CreatePostPresignedUrlResult } from '@fastgpt/service/common/s3/type';

export const getUploadAvatarPresignedUrl = (params: {
  filename: string;
  autoExpired?: boolean;
}) => {
  return POST<CreatePostPresignedUrlResult>('/common/file/presignAvatarPostUrl', params);
};

export const getUploadChatFilePresignedUrl = (params: PresignChatFilePostUrlParams) => {
  return POST<CreatePostPresignedUrlResult>('/core/chat/file/presignChatFilePostUrl', params);
};

export const getPresignedChatFileGetUrl = (params: PresignChatFileGetUrlParams) => {
  return POST<string>('/core/chat/file/presignChatFileGetUrl', params);
};

export const getUploadDatasetFilePresignedUrl = (params: {
  filename: string;
  datasetId: string;
}) => {
  return POST<CreatePostPresignedUrlResult>('/core/dataset/presignDatasetFilePostUrl', params);
};

export const getUploadTempFilePresignedUrl = (params: { filename: string }) => {
  return POST<CreatePostPresignedUrlResult>('/common/file/presignTempFilePostUrl', params);
};
