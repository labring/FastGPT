import { POST } from '@/web/common/api/request';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import type { CreatePostPresignedUrlResult } from '@fastgpt/service/common/s3/type';
import { type AxiosProgressEvent } from 'axios';

export const postS3UploadFile = (
  postURL: string,
  form: FormData,
  onUploadProgress?: (progressEvent: AxiosProgressEvent) => void
) =>
  POST(postURL, form, {
    timeout: 600000,
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

export const getUploadDatasetFilePresignedUrl = (params: {
  filename: string;
  datasetId: string;
}) => {
  return POST<CreatePostPresignedUrlResult>('/core/dataset/presignDatasetFilePostUrl', params);
};

export const getUploadTempFilePresignedUrl = (params: { filename: string }) => {
  return POST<CreatePostPresignedUrlResult>('/common/file/presignTempFilePostUrl', params);
};
