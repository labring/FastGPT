import { findAIModel } from '../../../core/ai/model';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/model';
import { ConcatBillQueueItemType } from './type';

export const formatModelChars2Points = ({
  model,
  inputTokens = 0,
  outputTokens = 0,
  modelType,
  multiple = 1000
}: {
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  modelType: `${ModelTypeEnum}`;
  multiple?: number;
}) => {
  const modelData = findAIModel(model);
  if (!modelData) {
    return {
      totalPoints: 0,
      modelName: ''
    };
  }

  const isIOPriceType = typeof modelData.inputPrice === 'number';

  const totalPoints = isIOPriceType
    ? (modelData.inputPrice || 0) * (inputTokens / multiple) +
      (modelData.outputPrice || 0) * (outputTokens / multiple)
    : (modelData.charsPointsPrice || 0) * ((inputTokens + outputTokens) / multiple);

  return {
    modelName: modelData.name,
    totalPoints
  };
};

export const pushReduceTeamAiPointsTask = ({
  teamId,
  totalPoints
}: {
  teamId: string;
  totalPoints: number;
}) => {
  global.reduceAiPointsQueue.push({
    teamId: String(teamId),
    totalPoints
  });
};

export const pushConcatBillTask = (data: ConcatBillQueueItemType[]) => {
  global.concatBillQueue.push(...data);
};
