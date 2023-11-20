import { GET, POST, PUT, DELETE } from '@/web/common/api/request';
import { AxiosProgressEvent } from 'axios';

export const postUploadImg = (base64Img: string, expiredTime?: Date) =>
  POST<string>('/common/file/uploadImage', { base64Img, expiredTime });

export const postUploadFiles = (
  data: FormData,
  onUploadProgress: (progressEvent: AxiosProgressEvent) => void
) =>
  POST<string[]>('/common/file/upload', data, {
    timeout: 48000,
    onUploadProgress,
    headers: {
      'Content-Type': 'multipart/form-data; charset=utf-8'
    }
  });
