import { KbTypeEnum } from '@/constants/dataset';
import type { RequestPaging } from '@/types';
import { TrainingModeEnum } from '@/constants/plugin';
import type { SearchTestItemType } from '@/types/core/dataset';
import { DatasetDataItemType } from '@/types/core/dataset/data';

/* ===== dataset ===== */
export type SearchTestResponseType = SearchTestItemType['results'];

/* ======= file =========== */

/* ==== data ===== */
export type PushDataResponse = {
  insertLen: number;
};
