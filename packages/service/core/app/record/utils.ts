import { MongoAppRecord } from './schema';
import { getLogger, mod } from '../../../common/logger';

const logger = getLogger(mod.coreApp);

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
    logger.error('recordAppUsage error', { error });
  });
};
