import { calculateModelPrice } from '@fastgpt/global/core/ai/pricing';
import type { SystemModelItemType } from '../../../core/ai/model/type';

export const formatModelChars2Points = ({
  modelData,
  inputTokens = 0,
  outputTokens = 0,
  multiple = 1000
}: {
  modelData?: SystemModelItemType;
  inputTokens?: number;
  outputTokens?: number;
  multiple?: number;
}) => {
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
