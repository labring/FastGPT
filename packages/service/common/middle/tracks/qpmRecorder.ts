import { getGlobalRedisConnection } from '../../redis';
import { TrackModel } from './schema';
import { TrackEnum } from '@fastgpt/global/common/middle/tracks/constants';
import { addLog } from '../../system/log';

const getCurrentMinuteBoundary = (): Date => {
  const now = new Date();
  const boundary = new Date(now);
  boundary.setSeconds(0, 0);
  return boundary;
};

export const recordTeamQPM = async () => {
  try {
    const redis = getGlobalRedisConnection();

    const keysWithPrefix = await redis.keys('fastgpt:frequency:chat:*');

    if (keysWithPrefix.length === 0) {
      addLog.info('No team chat activity in the last minute');
      return;
    }

    addLog.info(`Recording QPM for ${keysWithPrefix.length} teams`);

    // Batch read all counts using pipeline for efficiency
    const pipeline = redis.pipeline();
    keysWithPrefix.forEach((key) => {
      const keyWithoutPrefix = key.replace(/^fastgpt:/, '');
      pipeline.get(keyWithoutPrefix);
    });
    const results = await pipeline.exec();

    if (!results) {
      addLog.error('Failed to read QPM data from Redis');
      return;
    }

    // Prepare bulk write operations
    const currentMinute = getCurrentMinuteBoundary();
    const bulkOps = keysWithPrefix
      .map((key, index) => {
        const teamId = key.replace(/^fastgpt:frequency:chat:/, '');
        const [error, count] = results[index];

        if (error || !count) {
          addLog.warn(`Failed to read count for team ${teamId}`, { error });
          return null;
        }

        const requestCount = parseInt(count as string, 10);

        if (requestCount > 0) {
          return {
            updateOne: {
              filter: {
                event: TrackEnum.teamChatQPM,
                teamId,
                createTime: currentMinute
              },
              update: {
                $set: {
                  event: TrackEnum.teamChatQPM,
                  teamId,
                  createTime: currentMinute,
                  data: {
                    requestCount
                  }
                }
              },
              upsert: true
            }
          };
        }
        return null;
      })
      .filter((op): op is NonNullable<typeof op> => op !== null);

    if (bulkOps.length > 0) {
      await TrackModel.bulkWrite(bulkOps);
    }
  } catch (error) {
    addLog.error('Error recording team QPM', error);
  }
};
