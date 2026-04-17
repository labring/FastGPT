import { findAIModel } from '../../../core/ai/model';
import { calculateModelPrice } from '@fastgpt/global/core/ai/pricing';
import type { SystemModelItemType } from '../../../core/ai/type';

export const formatModelChars2Points = ({
  model,
  inputTokens = 0,
  outputTokens = 0,
  multiple = 1000
}: {
  model: string | SystemModelItemType;
  inputTokens?: number;
  outputTokens?: number;
  multiple?: number;
}) => {
  const modelData = findAIModel(model);
  if (!modelData) {
    return {
      totalPoints: 0,
      modelName: ''
    };
  }

  const { totalPoints } = calculateModelPrice({
    config: modelData,
    inputTokens,
    outputTokens,
    multiple
  });

  return {
    modelName: modelData.name,
    totalPoints
  };
};
