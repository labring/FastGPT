import { delay } from '@fastgpt/global/common/system/utils';
import { addLog } from '../../system/log';
import { TrackModel } from './schema';
import { TrackEnum } from '@fastgpt/global/common/middle/tracks/constants';

const batchUpdateTime = Number(process.env.TRACK_BATCH_UPDATE_TIME || 5000);

const getCurrentTenMinuteBoundary = () => {
  const now = new Date();
  const minutes = now.getMinutes();
  const tenMinuteBoundary = Math.floor(minutes / 10) * 10;

  const boundary = new Date(now);
  boundary.setMinutes(tenMinuteBoundary, 0, 0);
  return boundary;
};

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
    const currentBoundary = getCurrentTenMinuteBoundary();
    const batchMap = new Map<
      string,
      {
        event: TrackEnum;
        teamId: string;
        data: Record<string, any>;
      }
    >();

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
              teamId,
              data: {
                datasetId,
                count: 1
              }
            });
          }
        });
      }
    });

    const bulkOps = Array.from(batchMap.values()).map(({ event, teamId, data }) => ({
      updateOne: {
        filter: {
          event,
          teamId,
          ...(data.datasetId ? { 'data.datasetId': data.datasetId } : {}),
          createTime: currentBoundary
        },
        update: [
          {
            $set: {
              event,
              teamId,
              createTime: { $ifNull: ['$createTime', currentBoundary] },
              data: {
                ...(data.datasetId ? { datasetId: data.datasetId } : {}),
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
