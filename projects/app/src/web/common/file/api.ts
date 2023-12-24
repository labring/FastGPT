import { GET, POST, PUT, DELETE } from '@/web/common/api/request';
import type { UploadImgProps } from '@fastgpt/global/common/file/api.d';
import { AxiosProgressEvent } from 'axios';

export const postUploadImg = (e: UploadImgProps) => POST<string>('/common/file/uploadImage', e);

export const postUploadFiles = (
  data: FormData,
  onUploadProgress: (progressEvent: AxiosProgressEvent) => void
) =>
  POST<string[]>('/common/file/upload', data, {
    timeout: 480000,
    onUploadProgress,
    headers: {
      'Content-Type': 'multipart/form-data; charset=utf-8'
    }
  });
