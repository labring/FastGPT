import { POST, PUT } from '@/web/common/api/request';
import type {
  PresignChatFileGetUrlParams,
  PresignChatFilePostUrlParams
} from '@fastgpt/global/openapi/core/chat/file/api';
import type { CreatePostPresignedUrlResonseType } from '@fastgpt/global/common/file/s3/type';

export const getUploadAvatarPresignedUrl = (params: {
  filename: string;
  autoExpired?: boolean;
}) => {
  return POST<CreatePostPresignedUrlResonseType>('/common/file/presignAvatarPostUrl', params);
};

export const getUploadChatFilePresignedUrl = (params: PresignChatFilePostUrlParams) => {
  return POST<CreatePostPresignedUrlResonseType>('/core/chat/file/presignChatFilePostUrl', params);
};

export const getPresignedChatFileGetUrl = (params: PresignChatFileGetUrlParams) => {
  return POST<string>('/core/chat/file/presignChatFileGetUrl', params);
};

export const getUploadTempFilePresignedUrl = (params: { filename: string }) => {
  return POST<CreatePostPresignedUrlResonseType>('/common/file/presignTempFilePostUrl', params);
};
