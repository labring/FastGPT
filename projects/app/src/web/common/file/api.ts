import { POST } from '@/web/common/api/request';
import type {
  PresignChatFileGetUrlParams,
  PresignChatFilePostUrlParams,
  PresignDraftChatFilePostUrlParams,
  PrepareDraftFilesParams,
  PrepareDraftFilesResponse
} from '@fastgpt/global/openapi/core/chat/file/api';
import type {
  CreatePostPresignedUrlResponseType,
  PresignFileUploadParams
} from '@fastgpt/global/common/file/s3/type';

/** 校验草稿附件、按剩余有效期续期并获取新预览链接。 */
export const prepareChatInputDraftFiles = (params: PrepareDraftFilesParams) =>
  POST<PrepareDraftFilesResponse>('/core/chat/file/prepareDraftFiles', params);

export const getUploadAvatarPresignedUrl = (
  params: PresignFileUploadParams & {
    autoExpired?: boolean;
  }
) => {
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

export const getUploadTempFilePresignedUrl = (
  params: PresignFileUploadParams,
  config?: Parameters<typeof POST>[2]
) => {
  return POST<CreatePostPresignedUrlResponseType>(
    '/common/file/presignTempFilePostUrl',
    params,
    config
  );
};
