import { GET, POST, PUT } from './request';
import type { InitDateResponse } from '@/pages/api/system/getInitData';
import { AxiosProgressEvent } from 'axios';

export const getInitData = () => GET<InitDateResponse>('/system/getInitData');

export const uploadImg = (base64Img: string) => POST<string>('/system/uploadImage', { base64Img });

export const postUploadFiles = (
  data: FormData,
  onUploadProgress: (progressEvent: AxiosProgressEvent) => void
) =>
  POST<string[]>('/plugins/file/upload', data, {
    onUploadProgress,
    headers: {
      'Content-Type': 'multipart/form-data; charset=utf-8'
    }
  });

export const getFileViewUrl = (fileId: string) => GET<string>('/plugins/file/readUrl', { fileId });
