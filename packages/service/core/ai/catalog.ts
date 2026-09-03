import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { SystemModelDataType } from '@fastgpt/global/core/ai/model.schema';
import type { ModelDefaultIds } from '@fastgpt/global/core/ai/defaultModel';

/**
 * 按成员实际可用模型计算有效默认 ID。管理员配置不可用时仅在同类型内回退；图片数据集
 * 默认模型额外要求 vision 能力。chatTitle 是可选增强能力，不做隐式回退。
 */
export const resolveEffectiveDefaultModelIds = ({
  models,
  configuredDefaults
}: {
  models: SystemModelDataType[];
  configuredDefaults: ModelDefaultIds;
}): ModelDefaultIds => {
  const modelMap = new Map(models.map((model) => [model.modelId, model]));
  const resolve = ({
    configuredId,
    type,
    predicate
  }: {
    configuredId?: string;
    type: ModelTypeEnum;
    predicate?: (model: SystemModelDataType) => boolean;
  }) => {
    const isCandidate = (model?: SystemModelDataType) =>
      !!model && model.type === type && (!predicate || predicate(model));
    const configuredModel = configuredId ? modelMap.get(configuredId) : undefined;
    return isCandidate(configuredModel)
      ? configuredModel?.modelId
      : models.find((model) => isCandidate(model))?.modelId;
  };

  const configuredChatTitle = configuredDefaults.chatTitleLLM
    ? modelMap.get(configuredDefaults.chatTitleLLM)
    : undefined;

  return {
    [ModelTypeEnum.llm]: resolve({
      configuredId: configuredDefaults.llm,
      type: ModelTypeEnum.llm
    }),
    [ModelTypeEnum.embedding]: resolve({
      configuredId: configuredDefaults.embedding,
      type: ModelTypeEnum.embedding
    }),
    [ModelTypeEnum.tts]: resolve({
      configuredId: configuredDefaults.tts,
      type: ModelTypeEnum.tts
    }),
    [ModelTypeEnum.stt]: resolve({
      configuredId: configuredDefaults.stt,
      type: ModelTypeEnum.stt
    }),
    [ModelTypeEnum.rerank]: resolve({
      configuredId: configuredDefaults.rerank,
      type: ModelTypeEnum.rerank
    }),
    datasetTextLLM: resolve({
      configuredId: configuredDefaults.datasetTextLLM,
      type: ModelTypeEnum.llm
    }),
    datasetImageLLM: resolve({
      configuredId: configuredDefaults.datasetImageLLM,
      type: ModelTypeEnum.llm,
      predicate: (model) => model.type === ModelTypeEnum.llm && !!model.config.vision
    }),
    chatTitleLLM:
      configuredChatTitle?.type === ModelTypeEnum.llm ? configuredChatTitle.modelId : undefined
  };
};
