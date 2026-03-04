import { concatUsage } from '../../../support/wallet/usage/controller';
import { UsageItemTypeEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { addLog } from '../../../common/system/log';

const typeToItemType: Record<'target' | 'metric' | 'summary', UsageItemTypeEnum> = {
  target: UsageItemTypeEnum.evaluation_generateAnswer,
  metric: UsageItemTypeEnum.evaluation_metricsExecute,
  summary: UsageItemTypeEnum.evaluation_summaryGeneration
};

/**
 * Create merged evaluation usage record
 */
export const createMergedEvaluationUsage = async (params: {
  evalId: string;
  teamId: string;
  tmbId: string;
  usageId: string;
  totalPoints: number;
  type: 'target' | 'metric' | 'summary';
  inputTokens?: number;
  outputTokens?: number;
}) => {
  const { evalId, teamId, usageId, totalPoints, type, inputTokens, outputTokens } = params;

  await concatUsage({
    usageId,
    teamId,
    totalPoints,
    inputTokens: inputTokens || 0,
    outputTokens: outputTokens || 0,
    count: 1,
    itemType: typeToItemType[type]
  });

  addLog.debug(`[Evaluation] Record usage: ${evalId}, ${type}, ${totalPoints} points`);
};
