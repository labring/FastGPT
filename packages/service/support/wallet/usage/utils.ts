import { ModelTypeEnum, getModelMap } from '../../../core/ai/model';

export const formatModelChars2Points = ({
  model,
  tokens = 0,
  modelType,
  multiple = 1000
}: {
  model: string;
  tokens: number;
  modelType: `${ModelTypeEnum}`;
  multiple?: number;
}) => {
  const modelData = getModelMap?.[modelType]?.(model);
  if (!modelData) {
    return {
      totalPoints: 0,
      modelName: ''
    };
  }

  const totalPoints = (modelData.charsPointsPrice || 0) * (tokens / multiple);

  return {
    modelName: modelData.name,
    totalPoints
  };
};
