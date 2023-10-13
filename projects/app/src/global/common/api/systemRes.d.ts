import {
  type QAModelItemType,
  type ChatModelItemType,
  type VectorModelItemType,
  FunctionModelItemType
} from '@/types/model';
import type { FeConfigsType } from '@fastgpt/common/type/index.d';

export type InitDateResponse = {
  chatModels: ChatModelItemType[];
  qaModel: QAModelItemType;
  vectorModels: VectorModelItemType[];
  feConfigs: FeConfigsType;
  priceMd: string;
  systemVersion: string;
};
