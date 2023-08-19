import type { kbSchema } from './mongoSchema';

export type SelectedKbType = { kbId: string }[];

export type KbListItemType = {
  _id: string;
  avatar: string;
  name: string;
  tags: string[];
};
/* kb type */
export interface KbItemType extends kbSchema {
  totalData: number;
  tags: string;
}

export interface KbDataItemType {
  id: string;
  q: string; // 提问词
  a: string; // 原文
  source: string;
}

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
