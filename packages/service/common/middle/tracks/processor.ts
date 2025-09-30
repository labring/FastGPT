import { delay } from '@fastgpt/global/common/system/utils';
import { addLog } from '../../system/log';
import { TrackModel } from './schema';
import { TrackEnum } from '@fastgpt/global/common/middle/tracks/constants';

const batchUpdateTime = Number(process.env.TRACK_BATCH_UPDATE_TIME || 10000);

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
    await countTrackTimer();
    await delay(batchUpdateTime);
  }
};

export const countTrackTimer = async () => {
  if (!global.countTrackQueue || global.countTrackQueue.size === 0) {
    return;
  }

  const queuedItems = Array.from(global.countTrackQueue.values());
  global.countTrackQueue = new Map();

  try {
    const currentBoundary = getCurrentTenMinuteBoundary();

    const bulkOps = queuedItems
      .map(({ event, count, data }) => {
        if (event === TrackEnum.datasetSearch) {
          const { teamId, datasetId } = data;

          return [
            {
              updateOne: {
                filter: {
                  event,
                  teamId,
                  createTime: currentBoundary,
                  'data.datasetId': datasetId
                },
                update: [
                  {
                    $set: {
                      event,
                      teamId,
                      createTime: { $ifNull: ['$createTime', currentBoundary] },
                      data: {
                        datasetId,
                        count: { $add: [{ $ifNull: ['$data.count', 0] }, count] }
                      }
                    }
                  }
                ],
                upsert: true
              }
            }
          ];
        }
        return [];
      })
      .flat();

    if (bulkOps.length > 0) {
      await TrackModel.bulkWrite(bulkOps);
      addLog.info('Track timer processing success');
    }
  } catch (error) {
    addLog.error('Track timer processing error', error);
  }
};
