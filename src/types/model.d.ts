import { ModelStatusEnum } from '@/constants/model';
import type { ModelSchema } from './mongoSchema';
export interface ModelUpdateParams {
  name: string;
  avatar: string;
  systemPrompt: string;
  temperature: number;
  search: ModelSchema['search'];
  share: ModelSchema['share'];
  service: ModelSchema['service'];
  security: ModelSchema['security'];
}

export interface ModelDataItemType {
  id: string;
  status: 'waiting' | 'ready';
  q: string; // 提问词
  a: string; // 原文
  modelId: string;
  userId: string;
}

export interface ShareModelItem {
  _id: string;
  avatar: string;
  name: string;
  userId: string;
  share: ModelSchema['share'];
  isCollection: boolean;
}
