import type {
  LLMModelItemType,
  VectorModelItemType,
  AudioSpeechModels,
  STTModelType,
  ReRankModelItemType
} from '@fastgpt/global/core/ai/model.d';

import type { FastGPTFeConfigsType } from '@fastgpt/global/common/system/types/index.d';
import { SubPlanType } from '@fastgpt/global/support/wallet/sub/type';

export type InitDateResponse = {
  bufferId?: string;
  llmModels: LLMModelItemType[];
  vectorModels: VectorModelItemType[];
  audioSpeechModels: AudioSpeechModels[];
  reRankModels: ReRankModelItemType[];
  whisperModel: STTModelType;
  feConfigs: FastGPTFeConfigsType;
  subPlans?: SubPlanType;
  systemVersion: string;
};
