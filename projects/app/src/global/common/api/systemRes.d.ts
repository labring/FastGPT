import type {
  ChatModelItemType,
  FunctionModelItemType,
  LLMModelItemType,
  VectorModelItemType
} from '@/types/model';
import type { FeConfigsType } from '@fastgpt/global/common/system/types/index.d';

export type InitDateResponse = {
  chatModels: ChatModelItemType[];
  qaModels: LLMModelItemType[];
  cqModels: FunctionModelItemType[];
  extractModels: FunctionModelItemType[];
  qgModels: LLMModelItemType[];
  vectorModels: VectorModelItemType[];
  feConfigs: FeConfigsType;
  priceMd: string;
  systemVersion: string;
};
