import { GET, POST, PUT, DELETE } from '@/api/request';
import type { FileInfo, KbFileItemType } from '@/types/plugin';

import type { GetFileListProps, UpdateFileProps } from './file.d';

export const getDatasetFiles = (data: GetFileListProps) =>
  POST<KbFileItemType[]>(`/core/dataset/file/list`, data);
export const delDatasetFileById = (params: { fileId: string; kbId: string }) =>
  DELETE(`/core/dataset/file/delById`, params);
export const getFileInfoById = (fileId: string) =>
  GET<FileInfo>(`/core/dataset/file/detail`, { fileId });
export const delDatasetEmptyFiles = (kbId: string) =>
  DELETE(`/core/dataset/file/delEmptyFiles`, { kbId });

export const updateDatasetFile = (data: UpdateFileProps) => PUT(`/core/dataset/file/update`, data);
