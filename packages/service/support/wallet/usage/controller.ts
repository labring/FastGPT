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
  billSource: `${UsageSourceEnum}`;
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
        list: [
          {
            moduleName: 'wallet.moduleName.index',
            model: vectorModel,
            charsLength: 0,
            amount: 0
          },
          {
            moduleName: 'wallet.moduleName.qa',
            model: agentModel,
            charsLength: 0,
            amount: 0
          }
        ],
        total: 0
      }
    ],
    { session }
  );

  return { billId: String(_id) };
};
