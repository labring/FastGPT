import { delay } from '@fastgpt/global/common/system/utils';
import { addLog } from '../../../../common/system/log';
import { MongoDatasetSearchTrack } from './schema';
import type { DatasetSearchTrackProps } from '@fastgpt/global/core/dataset/api';

const batchUpdateTime = Number(process.env.BATCH_UPDATE_TIME || 3000);

export async function datasetSearchTrack(data: DatasetSearchTrackProps) {
  try {
    if (!global.datasetSearchQueue) {
      global.datasetSearchQueue = [];
    }

    global.datasetSearchQueue.push({
      datasetIds: data.datasetIds,
      teamId: data.teamId
    });
  } catch (error) {
    addLog.error('datasetSearchTrack error', error);
  }
}

export const datasetSearchTimerProcess = async () => {
  while (true) {
    await datasetSearchTimer();
    await delay(batchUpdateTime);
  }
};

export const datasetSearchTimer = async () => {
  if (!global.datasetSearchQueue || global.datasetSearchQueue.length === 0) {
    return;
  }

  const list = global.datasetSearchQueue.slice();
  global.datasetSearchQueue = [];

  const timeWindowStart = new Date(Date.now() - 10 * 60 * 1000);
  const datasetSearchMap = new Map<
    string,
    {
      datasetId: string;
      teamId: string;
      count: number;
    }
  >();

  list.forEach(({ datasetIds, teamId }) => {
    datasetIds.forEach((datasetId: string) => {
      const key = `${datasetId}_${teamId}`;
      const existing = datasetSearchMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        datasetSearchMap.set(key, { datasetId, teamId, count: 1 });
      }
    });
  });

  const bulkOps = Array.from(datasetSearchMap.values()).map((item) => ({
    updateOne: {
      filter: {
        datasetId: item.datasetId,
        teamId: item.teamId,
        createTime: { $gte: timeWindowStart }
      },
      update: {
        $inc: { searchCount: item.count },
        $setOnInsert: { createTime: new Date() }
      },
      upsert: true
    }
  }));

  await MongoDatasetSearchTrack.bulkWrite(bulkOps);
  addLog.info(`Dataset search timer: processed ${bulkOps.length} records`);
};
