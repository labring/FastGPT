import { KbTypeEnum } from '@/constants/dataset';
import type { RequestPaging } from '@/types';
import { TrainingModeEnum } from '@/constants/plugin';
import type { SearchTestItemType } from '@/types/core/dataset';
import { DatasetDataItemType } from '@/types/core/dataset/data';

/* ===== dataset ===== */
export type DatasetUpdateParams = {
  id: string;
  parentId?: string;
  tags?: string;
  name?: string;
  avatar?: string;
};
export type CreateDatasetParams = {
  parentId?: string;
  name: string;
  tags: string[];
  avatar: string;
  vectorModel?: string;
  type: `${KbTypeEnum}`;
};

export type SearchTestProps = {
  kbId: string;
  text: string;
};

/* ======= file =========== */
export type GetFileListProps = RequestPaging & {
  kbId: string;
  searchText: string;
};

export type UpdateFileProps = { id: string; name?: string; datasetUsed?: boolean };

export type MarkFileUsedProps = { fileIds: string[] };

/* ==== data ===== */
export type PushDataProps = {
  kbId: string;
  data: DatasetDataItemType[];
  mode: `${TrainingModeEnum}`;
  prompt?: string;
  billId?: string;
};

export type UpdateDatasetDataPrams = {
  dataId: string;
  kbId: string;
  a?: string;
  q?: string;
};

export type GetDatasetDataListProps = RequestPaging & {
  kbId: string;
  searchText: string;
  fileId: string;
};
