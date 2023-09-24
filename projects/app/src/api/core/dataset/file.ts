import { GET, POST, PUT, DELETE } from '@/api/request';
import type { DatasetFileItemType } from '@/types/core/dataset/file';
import type { GSFileInfoType } from '@/types/common/file';

import type { GetFileListProps, UpdateFileProps, MarkFileUsedProps } from './file.d';

export const getDatasetFiles = (data: GetFileListProps) =>
  POST<DatasetFileItemType[]>(`/core/dataset/file/list`, data);
export const delDatasetFileById = (params: { fileId: string; kbId: string }) =>
  DELETE(`/core/dataset/file/delById`, params);
export const getFileInfoById = (fileId: string) =>
  GET<GSFileInfoType>(`/core/dataset/file/detail`, { fileId });
export const delDatasetEmptyFiles = (kbId: string) =>
  DELETE(`/core/dataset/file/delEmptyFiles`, { kbId });

export const updateDatasetFile = (data: UpdateFileProps) => PUT(`/core/dataset/file/update`, data);

export const putMarkFilesUsed = (data: MarkFileUsedProps) =>
  PUT(`/core/dataset/file/markUsed`, data);
