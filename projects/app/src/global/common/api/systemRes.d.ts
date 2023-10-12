import {
  type QAModelItemType,
  type ChatModelItemType,
  type VectorModelItemType,
  FunctionModelItemType
} from '@/types/model';

export type InitDateResponse = {
  chatModels: ChatModelItemType[];
  qaModel: QAModelItemType;
  vectorModels: VectorModelItemType[];
  feConfigs: FeConfigsType;
  systemVersion: string;
};
