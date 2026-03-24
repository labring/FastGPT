import { findAIModel } from '../../../core/ai/model';
import { calculateModelPrice } from '@fastgpt/global/core/ai/pricing';

export const formatModelChars2Points = ({
  model,
  inputTokens = 0,
  outputTokens = 0,
  multiple = 1000
}: {
  model: string;
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
