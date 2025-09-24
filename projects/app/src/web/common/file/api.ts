import { DELETE, GET, POST } from '@/web/common/api/request';
import type { UploadImgProps } from '@fastgpt/global/common/file/api.d';
import type { UploadPresignedURLResponse } from '@fastgpt/service/common/s3/type';
import { type AxiosProgressEvent } from 'axios';

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
  onUploadProgress?: (progressEvent: AxiosProgressEvent) => void
) =>
  POST(postURL, form, {
    timeout: 600000,
    headers: {
      'Content-Type': 'multipart/form-data'
    },
    onUploadProgress
  });
