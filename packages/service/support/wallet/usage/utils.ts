import { LLMModelItemType } from '@fastgpt/global/core/ai/model.d';
import { ModelTypeEnum, getLLMModelPriceType, getModelMap } from '../../../core/ai/model';

export const formatModelChars2Points = ({
  model,
  tokens = 0,
  inputTokens = 0,
  outputTokens = 0,
  modelType,
  multiple = 1000
}: {
  model: string;
  tokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  modelType: `${ModelTypeEnum}`;
  multiple?: number;
}) => {
  const modelData = getModelMap?.[modelType]?.(model) as LLMModelItemType;
  if (!modelData) {
    return {
      totalPoints: 0,
      modelName: ''
    };
  }

  const isIOType = modelType === ModelTypeEnum.llm && getLLMModelPriceType();

  const totalPoints = isIOType
    ? ((modelData as LLMModelItemType).inputPrice || 0) * (inputTokens / multiple) +
      ((modelData as LLMModelItemType).outputPrice || 0) * (outputTokens / multiple)
    : (modelData.charsPointsPrice || 0) * ((tokens || inputTokens + outputTokens) / multiple);

  return {
    modelName: modelData.name,
    totalPoints
  };
};
