import { KbTypeEnum } from '@/constants/dataset';
import type { RequestPaging } from '@/types';
import { TrainingModeEnum } from '@/constants/plugin';
import type { SearchTestItemType } from '@/types/core/dataset';

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

export type DatasetUpdateParams = {
  id: string;
  parentId?: string;
  tags?: string;
  name?: string;
  avatar?: string;
};

export type SearchTestProps = {
  kbId: string;
  text: string;
};
export type SearchTestResponseType = SearchTestItemType['results'];
