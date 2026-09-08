import type { AppTTSConfigType } from '@fastgpt/global/core/app/type';
import type { MyTTSModelItemType } from '@fastgpt/global/openapi/core/ai/model/api';
import { TTSTypeEnum } from '@/web/core/app/constants';
import { getModelInitializationValue } from '@/web/core/ai/model/selection';

/** 空的模型播报配置实体化为默认模型和音色；明确关闭、浏览器播报及失效引用不自动替换。 */
export const getTtsInitialization = ({
  value,
  models,
  defaultModelId
}: {
  value?: AppTTSConfigType;
  models: MyTTSModelItemType[];
  defaultModelId?: string;
}): AppTTSConfigType | undefined => {
  if (value?.type === TTSTypeEnum.none || value?.type === TTSTypeEnum.web) return;
  const modelId = getModelInitializationValue({
    value: value?.modelId ?? value?.model,
    models,
    defaultModelId
  });
  if (!modelId || modelId === value?.modelId) return;
  const voices = models.find((model) => model.modelId === modelId)?.config.voices ?? [];
  return {
    ...value,
    type: TTSTypeEnum.model,
    modelId,
    model: undefined,
    voice: voices.find((voice) => voice.value === value?.voice)?.value ?? voices[0]?.value
  };
};
