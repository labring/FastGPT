import { GET, POST, PUT } from './request';
import type { InitDateResponse } from '@/global/common/api/systemRes';
import { AxiosProgressEvent } from 'axios';

export const getSystemInitData = () => GET<InitDateResponse>('/system/getInitData');

export const postUploadImg = (base64Img: string) =>
  POST<string>('/system/file/uploadImage', { base64Img });

export const postUploadFiles = (
  data: FormData,
  onUploadProgress: (progressEvent: AxiosProgressEvent) => void
) =>
  POST<string[]>('/system/file/upload', data, {
    onUploadProgress,
    headers: {
      'Content-Type': 'multipart/form-data; charset=utf-8'
    }
  });

export const getFileViewUrl = (fileId: string) => GET<string>('/system/file/readUrl', { fileId });
