import { GET, POST, PUT, DELETE } from '@/web/common/api/request';
import { AxiosProgressEvent } from 'axios';

export const postUploadImg = (base64Img: string) =>
  POST<string>('/common/file/uploadImage', { base64Img });

export const postUploadFiles = (
  data: FormData,
  onUploadProgress: (progressEvent: AxiosProgressEvent) => void
) =>
  POST<string[]>('/common/file/upload', data, {
    timeout: 60000,
    onUploadProgress,
    headers: {
      'Content-Type': 'multipart/form-data; charset=utf-8'
    }
  });
