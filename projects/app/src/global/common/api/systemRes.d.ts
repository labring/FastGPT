import type {
  ChatModelItemType,
  FunctionModelItemType,
  LLMModelItemType,
  VectorModelItemType,
  AudioSpeechModels
} from '@fastgpt/global/core/ai/model.d';

import type { FeConfigsType } from '@fastgpt/global/common/system/types/index.d';

export type InitDateResponse = {
  chatModels: ChatModelItemType[];
  qaModels: LLMModelItemType[];
  cqModels: FunctionModelItemType[];
  extractModels: FunctionModelItemType[];
  vectorModels: VectorModelItemType[];
  audioSpeechModels: AudioSpeechModels[];
  feConfigs: FeConfigsType;
  priceMd: string;
  systemVersion: string;
};
