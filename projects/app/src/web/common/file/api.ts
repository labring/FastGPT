import { POST } from '@/web/common/api/request';
import type {
  PresignChatFileGetUrlParams,
  PresignChatFilePostUrlParams,
  PresignDraftChatFilePostUrlParams
} from '@fastgpt/global/openapi/core/chat/file/api';
import type { CreatePostPresignedUrlResponseType } from '@fastgpt/global/common/file/s3/type';

export const getUploadAvatarPresignedUrl = (params: {
  filename: string;
  autoExpired?: boolean;
}) => {
  return POST<CreatePostPresignedUrlResponseType>('/common/file/presignAvatarPostUrl', params);
};

export const getUploadChatFilePresignedUrl = (
  params: PresignChatFilePostUrlParams,
  config?: Parameters<typeof POST>[2]
) => {
  return POST<CreatePostPresignedUrlResponseType>(
    '/core/chat/file/presignChatFilePostUrl',
    params,
    config
  );
};

export const getUploadDraftChatFilePresignedUrl = (
  params: PresignDraftChatFilePostUrlParams,
  config?: Parameters<typeof POST>[2]
) => {
  return POST<CreatePostPresignedUrlResponseType>(
    '/core/chat/file/presignDraftChatFilePostUrl',
    params,
    config
  );
};

export const getPresignedChatFileGetUrl = (params: PresignChatFileGetUrlParams) => {
  return POST<string>('/core/chat/file/presignChatFileGetUrl', params);
};

export const getUploadTempFilePresignedUrl = (params: { filename: string }) => {
  return POST<CreatePostPresignedUrlResponseType>('/common/file/presignTempFilePostUrl', params);
};
