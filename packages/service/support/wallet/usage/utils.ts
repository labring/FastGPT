import { calculateModelPrice } from '@fastgpt/global/core/ai/pricing';
import type { SystemModelDataType } from '@fastgpt/global/core/ai/model.schema';

export const formatModelChars2Points = ({
  model,
  inputTokens = 0,
  outputTokens = 0,
  multiple = 1000
}: {
  model: SystemModelDataType;
  inputTokens?: number;
  outputTokens?: number;
  multiple?: number;
}) => {
  const { totalPoints } = calculateModelPrice({
    config: model,
    inputTokens,
    outputTokens,
    multiple
  });

  return {
    modelId: model.modelId,
    totalPoints
  };
};
