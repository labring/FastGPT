import { MongoAppRecord } from './schema';
import { addLog } from '../../../common/system/log';

export const recordAppUsage = async ({
  appId,
  tmbId,
  teamId
}: {
  appId: string;
  tmbId: string;
  teamId: string;
}) => {
  await MongoAppRecord.updateOne(
    { tmbId, appId },
    {
      $set: {
        teamId,
        lastUsedTime: new Date()
      }
    },
    {
      upsert: true
    }
  ).catch((error) => {
    addLog.error('recordAppUsage error', error);
  });
};
