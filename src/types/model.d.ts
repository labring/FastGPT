import { ModelStatusEnum } from '@/constants/model';
import type { ModelSchema } from './mongoSchema';
export interface ModelUpdateParams {
  name: string;
  systemPrompt: string;
  intro: string;
  temperature: number;
  search: ModelSchema['search'];
  service: ModelSchema['service'];
  security: ModelSchema['security'];
}

export interface ModelDataItemType {
  id: string;
  status: 0 | 1; // 1代表向量生成完毕
  q: string; // 提问词
  a: string; // 原文
  modelId: string;
  userId: string;
}
