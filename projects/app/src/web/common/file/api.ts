import type { PreviewContextProps } from '@/pages/api/common/file/previewContent';
import { GET, POST } from '@/web/common/api/request';
import type { UploadImgProps } from '@fastgpt/global/common/file/api.d';
import { AxiosProgressEvent } from 'axios';

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

export const getPreviewFileContent = (data: PreviewContextProps) =>
  POST<{
    previewContent: string;
    totalLength: number;
  }>('/common/file/previewContent', data, {
    timeout: 600000
  });
