import { findAIModel } from '../../../core/ai/model';

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

  const isIOPriceType = typeof modelData.inputPrice === 'number' && modelData.inputPrice > 0;

  const totalPoints = isIOPriceType
    ? (modelData.inputPrice || 0) * (inputTokens / multiple) +
      (modelData.outputPrice || 0) * (outputTokens / multiple)
    : (modelData.charsPointsPrice || 0) * ((inputTokens + outputTokens) / multiple);

  return {
    modelName: modelData.name,
    totalPoints
  };
};
