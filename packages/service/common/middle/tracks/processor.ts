import { delay } from '@fastgpt/global/common/system/utils';
import { addLog } from '../../system/log';
import { TrackModel } from './schema';
import { TrackEnum } from '@fastgpt/global/common/middle/tracks/constants';

const batchUpdateTime = Number(process.env.TRACK_BATCH_UPDATE_TIME || 3000);

export const trackTimerProcess = async () => {
  while (true) {
    await trackTimer();
    await delay(batchUpdateTime);
  }
};

export const trackTimer = async () => {
  if (!global.tracksQueue || global.tracksQueue.length === 0) {
    return;
  }

  const queuedItems = global.tracksQueue.slice();
  global.tracksQueue = [];

  try {
    if (!global.feConfigs?.isPlus || queuedItems.length === 0) return;

    const timeWindowStart = new Date(Date.now() - 10 * 60 * 1000);
    const batchMap = new Map<
      string,
      {
        event: TrackEnum;
        uid: string;
        teamId: string;
        tmbId: string;
        data: Record<string, any>;
      }
    >();

    // Group items by unique key for merging
    queuedItems.forEach(({ event, data }) => {
      const { uid, teamId, tmbId, datasetIds } = data;
      if (event === TrackEnum.datasetSearch) {
        datasetIds.forEach((datasetId: string) => {
          const key = `${event}_${uid}_${teamId}_${tmbId}_${datasetId}`;

          const existing = batchMap.get(key);
          if (existing) {
            existing.data.count++;
          } else {
            batchMap.set(key, {
              event,
              uid,
              teamId,
              tmbId,
              data: {
                datasetId,
                count: 1
              }
            });
          }
        });
      }
    });

    // Prepare bulk operations with time-based merging
    const bulkOps = Array.from(batchMap.values()).map(({ event, uid, teamId, tmbId, data }) => ({
      updateOne: {
        filter: {
          event,
          uid,
          teamId,
          tmbId,
          'data.datasetId': data.datasetId,
          createTime: { $gte: timeWindowStart }
        },
        update: [
          {
            $set: {
              event,
              uid,
              teamId,
              tmbId,
              createTime: { $ifNull: ['$createTime', new Date()] },
              data: {
                datasetId: data.datasetId,
                count: { $add: [{ $ifNull: ['$data.count', 0] }, data.count] }
              }
            }
          }
        ],
        upsert: true
      }
    }));

    if (bulkOps.length > 0) {
      await TrackModel.bulkWrite(bulkOps);
    }
  } catch (error) {
    addLog.error('Track timer processing error', error);
  }
};
