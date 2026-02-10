import { MongoAppRecord } from './schema';
import { getLogger, LogCategories } from '../../../common/logger';

const logger = getLogger(LogCategories.MODULE.APP.LOGS);

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
    logger.error('Failed to record app usage', { appId, tmbId, teamId, error });
  });
};
