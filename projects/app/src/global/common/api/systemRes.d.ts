import type {
  LLMModelItemType,
  EmbeddingModelItemType,
  AudioSpeechModels,
  STTModelType,
  ReRankModelItemType
} from '@fastgpt/global/core/ai/model.d';

import type { FastGPTFeConfigsType } from '@fastgpt/global/common/system/types/index.d';
import { SubPlanType } from '@fastgpt/global/support/wallet/sub/type';
import { SystemDefaultModelType, SystemModelItemType } from '@fastgpt/service/core/ai/type';

export type InitDateResponse = {
  bufferId?: string;

  feConfigs?: FastGPTFeConfigsType;
  subPlans?: SubPlanType;
  systemVersion?: string;

  activeModelList?: SystemModelItemType[];
  defaultModels?: SystemDefaultModelType;
};
