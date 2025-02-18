import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { MongoUsage } from './schema';
import { ClientSession, Types } from '../../../common/mongo';
import { addLog } from '../../../common/system/log';
import { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { ConcatUsageProps, CreateUsageProps } from '@fastgpt/global/support/wallet/usage/api';
import { i18nT } from '../../../../web/i18n/utils';
import { pushConcatBillTask, pushReduceTeamAiPointsTask } from './utils';

import { POST } from '../../../common/api/plusRequest';
import { FastGPTProUrl } from '../../../common/system/constants';

export async function createUsage(data: CreateUsageProps) {
  try {
    // In FastGPT server
    if (FastGPTProUrl) {
      await POST('/support/wallet/usage/createUsage', data);
    } else if (global.reduceAiPointsQueue) {
      // In FastGPT pro server
      await MongoUsage.create(data);
      pushReduceTeamAiPointsTask({ teamId: data.teamId, totalPoints: data.totalPoints });

      if (data.totalPoints === 0) {
        addLog.info('0 totalPoints', data);
      }
    }
  } catch (error) {
    addLog.error('createUsage error', error);
  }
}
export async function concatUsage(data: ConcatUsageProps) {
  try {
    // In FastGPT server
    if (FastGPTProUrl) {
      await POST('/support/wallet/usage/concatUsage', data);
    } else if (global.reduceAiPointsQueue) {
      const {
        teamId,
        billId,
        totalPoints = 0,
        listIndex,
        inputTokens = 0,
        outputTokens = 0
      } = data;

      // billId is required and valid
      if (!billId || !Types.ObjectId.isValid(billId)) return;

      // In FastGPT pro server
      pushConcatBillTask([
        {
          billId,
          listIndex,
          inputTokens,
          outputTokens,
          totalPoints
        }
      ]);
      pushReduceTeamAiPointsTask({ teamId, totalPoints });

      if (data.totalPoints === 0) {
        addLog.info('0 totalPoints', data);
      }
    }
  } catch (error) {
    addLog.error('concatUsage error', error);
  }
}

export const createChatUsage = ({
  appName,
  appId,
  pluginId,
  teamId,
  tmbId,
  source,
  flowUsages
}: {
  appName: string;
  appId?: string;
  pluginId?: string;
  teamId: string;
  tmbId: string;
  source: UsageSourceEnum;
  flowUsages: ChatNodeUsageType[];
}) => {
  const totalPoints = flowUsages.reduce((sum, item) => sum + (item.totalPoints || 0), 0);

  createUsage({
    teamId,
    tmbId,
    appName,
    appId,
    pluginId,
    totalPoints,
    source,
    list: flowUsages.map((item) => ({
      moduleName: item.moduleName,
      amount: item.totalPoints || 0,
      model: item.model,
      inputTokens: item.inputTokens,
      outputTokens: item.outputTokens
    }))
  });
  addLog.debug(`Create chat usage`, {
    source,
    teamId,
    totalPoints
  });
  return { totalPoints };
};

export const createTrainingUsage = async ({
  teamId,
  tmbId,
  appName,
  billSource,
  vectorModel,
  agentModel,
  session
}: {
  teamId: string;
  tmbId: string;
  appName: string;
  billSource: UsageSourceEnum;
  vectorModel: string;
  agentModel: string;
  session?: ClientSession;
}) => {
  const [{ _id }] = await MongoUsage.create(
    [
      {
        teamId,
        tmbId,
        appName,
        source: billSource,
        totalPoints: 0,
        list: [
          {
            moduleName: i18nT('common:support.wallet.moduleName.index'),
            model: vectorModel,
            amount: 0,
            inputTokens: 0,
            outputTokens: 0
          },
          {
            moduleName: i18nT('common:support.wallet.moduleName.qa'),
            model: agentModel,
            amount: 0,
            inputTokens: 0,
            outputTokens: 0
          },
          {
            moduleName: i18nT('common:core.dataset.training.Auto mode'),
            model: agentModel,
            amount: 0,
            inputTokens: 0,
            outputTokens: 0
          }
        ]
      }
    ],
    { session }
  );

  return { billId: String(_id) };
};
