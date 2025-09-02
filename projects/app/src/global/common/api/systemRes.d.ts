import type {
  LLMModelItemType,
  EmbeddingModelItemType,
  AudioSpeechModels,
  STTModelType,
  RerankModelItemType
} from '@fastgpt/global/core/ai/model.d';

import type { FastGPTFeConfigsType } from '@fastgpt/global/common/system/types/index.d';
import type { SubPlanType } from '@fastgpt/global/support/wallet/sub/type';
import type { SystemDefaultModelType, SystemModelItemType } from '@fastgpt/service/core/ai/type';

export type InitDateResponse = {
  bufferId?: string;

  feConfigs?: FastGPTFeConfigsType;
  subPlans?: SubPlanType;
  systemVersion?: string;

  activeModelList?: SystemModelItemType[];
  defaultModels?: SystemDefaultModelType;
  modelProviders?: {
    listData: ModelProviderType[];
    mapData: Map<string, ModelProviderType>;
  };
  aiproxyIdMap?: {
    listData: ModelProviderListType[];
    mapData: Map<string, ModelProviderListType>;
  };
};
