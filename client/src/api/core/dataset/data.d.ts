import { KbTypeEnum } from '@/constants/dataset';
import type { RequestPaging } from '@/types';
import { TrainingModeEnum } from '@/constants/plugin';

export type PushDataProps = {
  kbId: string;
  data: DatasetItemType[];
  mode: `${TrainingModeEnum}`;
  prompt?: string;
  billId?: string;
};
export type PushDataResponse = {
  insertLen: number;
};

export type UpdateDataPrams = {
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
