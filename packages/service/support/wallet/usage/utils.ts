import { getModelById } from '../../../core/ai/model';
import { calculateModelPrice } from '@fastgpt/global/core/ai/pricing';

export const formatModelChars2Points = ({
  modelId,
  inputTokens = 0,
  outputTokens = 0,
  multiple = 1000
}: {
  modelId: string;
  inputTokens?: number;
  outputTokens?: number;
  multiple?: number;
}) => {
  const modelData = getModelById(modelId);
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
    modelId: modelData.id,
    modelName: modelData.name,
    totalPoints
  };
};
