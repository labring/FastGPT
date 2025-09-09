import { concatUsage, evaluationUsageIndexMap } from '../../../support/wallet/usage/controller';
import { addLog } from '../../../common/system/log';

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
  const { evalId, teamId, tmbId, usageId, totalPoints, type, inputTokens, outputTokens } = params;

  const listIndex = evaluationUsageIndexMap[type];

  await concatUsage({
    billId: usageId,
    teamId,
    tmbId,
    totalPoints,
    inputTokens: inputTokens || 0,
    outputTokens: outputTokens || 0,
    count: 1,
    listIndex
  });

  addLog.debug(`[Evaluation] Record usage: ${evalId}, ${type}, ${totalPoints} points`);
};
