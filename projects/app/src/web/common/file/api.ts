import { DELETE, GET, POST } from '@/web/common/api/request';
import type { UploadImgProps } from '@fastgpt/global/common/file/api.d';
import { type AxiosProgressEvent } from 'axios';
import type { PresignedUrlResponse } from '@fastgpt/service/common/file/plugin/config';

export const postUploadImg = (e: UploadImgProps) => POST<string>('/common/file/uploadImage', e);

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
  onUploadProgress: (progressEvent: AxiosProgressEvent) => void
) =>
  POST(postURL, form, {
    timeout: 600000,
    headers: {
      'Content-Type': 'multipart/form-data'
    },
    onUploadProgress
  });

export const postPresignedUrl = (data: {
  filename: string;
  contentType?: string;
  metadata?: Record<string, string>;
  maxSize?: number;
}) => POST<PresignedUrlResponse>('/common/file/plugin/presignedUrl', data);

export const postConfirmUpload = (data: { objectName: string; size: string }) =>
  POST<string>('/common/file/plugin/confirmUpload', data);

export const postUploadFileAndUrl = (url: string) =>
  POST<void>('/plugin/upload', {
    url: url
  });

export const postDeletePlugin = (toolId: string) =>
  DELETE<void>('/plugin/delete', {
    toolId
  });
