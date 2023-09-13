import { GET, POST } from '../request';

import { AxiosProgressEvent } from 'axios';

export const uploadImg = (base64Img: string) => POST<string>('/system/uploadImage', { base64Img });

export const postUploadFiles = (
  data: FormData,
  onUploadProgress: (progressEvent: AxiosProgressEvent) => void
) =>
  POST<string[]>('/support/file/upload', data, {
    onUploadProgress,
    headers: {
      'Content-Type': 'multipart/form-data; charset=utf-8'
    }
  });

export const getFileViewUrl = (fileId: string) => GET<string>('/support/file/readUrl', { fileId });
