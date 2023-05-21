import type { kbSchema } from './mongoSchema';
import { PluginTypeEnum } from '@/constants/plugin';

/* kb type */
export interface KbItemType extends kbSchema {
  totalData: number;
  tags: string;
}

export interface KbDataItemType {
  id: string;
  status: 'waiting' | 'ready';
  q: string; // 提问词
  a: string; // 原文
  kbId: string;
  userId: string;
}

/* plugin */
export interface PluginConfig {
  name: string;
  desc: string;
  url: string;
  category: `${PluginTypeEnum}`;
  uniPrice: 22; // 1k token
  params: [
    {
      type: '';
    }
  ];
}

export type TextPluginRequestParams = {
  input: string;
};
