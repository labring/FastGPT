import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { MongoUsage } from './schema';
import { ClientSession } from '../../../common/mongo';

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
            moduleName: 'support.wallet.moduleName.index',
            model: vectorModel,
            tokens: 0,
            amount: 0
          },
          {
            moduleName: 'support.wallet.moduleName.qa',
            model: agentModel,
            tokens: 0,
            amount: 0
          },
          {
            moduleName: 'core.dataset.training.Auto mode',
            model: agentModel,
            tokens: 0,
            amount: 0
          }
        ]
      }
    ],
    { session }
  );

  return { billId: String(_id) };
};
