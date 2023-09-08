import { VectorModelItemType } from './model';
import type { kbSchema } from './mongoSchema';

export type SelectedKbType = { kbId: string; vectorModel: VectorModelItemType }[];

export type KbListItemType = Omit<kbSchema, 'vectorModel'> & {
  vectorModel: VectorModelItemType;
};

/* kb type */
export interface KbItemType {
  _id: string;
  avatar: string;
  name: string;
  userId: string;
  vectorModel: VectorModelItemType;
  tags: string;
}

export type DatasetItemType = {
  q: string; // 提问词
  a: string; // 原文
  source?: string;
  file_id?: string;
};
export type KbDataItemType = DatasetItemType & {
  id: string;
};

export type KbTestItemType = {
  id: string;
  kbId: string;
  text: string;
  time: Date;
  results: (KbDataItemType & { score: number })[];
};

export type FetchResultItem = {
  url: string;
  content: string;
};
