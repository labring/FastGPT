import { POST } from '@/web/common/api/request';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import type { CreatePostPresignedUrlResult } from '@fastgpt/service/common/s3/type';
import { type AxiosProgressEvent } from 'axios';

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

export const postS3UploadFile = (
  postURL: string,
  form: FormData,
  onUploadProgress?: (progressEvent: AxiosProgressEvent) => void
) =>
  POST(postURL, form, {
    timeout: 600000,
    headers: {
      'Content-Type': 'multipart/form-data'
    },
    onUploadProgress
  });

export const getUploadAvatarPresignedUrl = (params: {
  filename: string;
  autoExpired?: boolean;
}) => {
  return POST<CreatePostPresignedUrlResult>('/common/file/presignAvatarPostUrl', params);
};

export const getUploadChatFilePresignedUrl = (params: {
  filename: string;
  appId: string;
  chatId: string;
  outLinkAuthData?: OutLinkChatAuthProps;
}) => {
  return POST<CreatePostPresignedUrlResult>('/core/chat/presignChatFilePostUrl', params);
};

export const getPresignedChatFileGetUrl = (params: {
  key: string;
  appId: string;
  outLinkAuthData?: OutLinkChatAuthProps;
}) => {
  return POST<string>('/core/chat/presignChatFileGetUrl', params);
};
