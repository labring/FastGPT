import type {
  ChatModelItemType,
  FunctionModelItemType,
  LLMModelItemType,
  VectorModelItemType,
  AudioSpeechModels,
  WhisperModelType,
  ReRankModelItemType
} from '@fastgpt/global/core/ai/model.d';

import type { FastGPTFeConfigsType } from '@fastgpt/global/common/system/types/index.d';
import { AppSimpleEditConfigTemplateType } from '@fastgpt/global/core/app/type';
import { SubPlanType } from '@fastgpt/global/support/wallet/sub/type';

export type InitDateResponse = {
  chatModels: ChatModelItemType[];
  qaModels: LLMModelItemType[];
  cqModels: FunctionModelItemType[];
  extractModels: FunctionModelItemType[];
  vectorModels: VectorModelItemType[];
  audioSpeechModels: AudioSpeechModels[];
  reRankModels: ReRankModelItemType[];
  qgModes: LLMModelItemType[];
  whisperModel: WhisperModelType;
  feConfigs: FastGPTFeConfigsType;
  subPlans?: SubPlanType;
  systemVersion: string;
  simpleModeTemplates: AppSimpleEditConfigTemplateType[];
};
