import type { kbSchema } from './mongoSchema';

export type SelectedKbType = { kbId: string }[];

export type KbListItemType = {
  _id: string;
  avatar: string;
  name: string;
  tags: string[];
  vectorModelName: string;
};
/* kb type */
export interface KbItemType {
  _id: string;
  avatar: string;
  name: string;
  userId: string;
  vectorModelName: string;
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
