import { NextAPI } from '@/service/middleware/entry';
import { retryFn } from '@fastgpt/global/common/system/utils';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { websiteSyncQueue } from './websiteSync';
import {
  upsertDatasetSyncJobScheduler,
  addDatasetSyncJob
} from '@fastgpt/service/core/dataset/datasetSync';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { getGlobalRedisConnection } from '@fastgpt/service/common/redis';
import { addHours } from 'date-fns';
import { type NextApiRequest, type NextApiResponse } from 'next';

const clearAllWebsiteSyncRedisData = async () => {
  const redis = getGlobalRedisConnection();

  console.log('开始清理Redis中所有websiteSync相关数据');

  let totalDeletedKeys = 0;

  // find all websiteSync related keys
  const patterns = [
    '*websiteSync*',
    '*websitesync*',
    'bull:websiteSync*',
    'bull:websiteSync:*',
    'fastgpt:websiteSync*',
    'fastgpt:bull:websiteSync*'
  ];
  console.log('patterns', patterns);

  for (const pattern of patterns) {
    try {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        console.log(`pattern "${pattern}" found ${keys.length} keys:`);
        keys.forEach((key) => console.log(`  - ${key}`));

        // delete keys
        let successCount = 0;
        for (const key of keys) {
          try {
            const result = await redis.del(key);
            if (result > 0) {
              successCount++;
              console.log(`✅ success delete key: ${key}`);
            } else {
              console.log(`❌ delete key failed (return 0): ${key}`);
            }
          } catch (deleteError) {
            console.error(`❌ delete key failed "${key}":`, deleteError);
          }
        }

        totalDeletedKeys += successCount;
        console.log(`pattern "${pattern}" success delete ${successCount}/${keys.length} keys`);
      } else {
        console.log(`pattern "${pattern}" not found keys`);
      }
    } catch (error) {
      console.error(`error when processing pattern "${pattern}":`, error);
    }
  }

  // extra clear specific BullMQ related keys
  const specificKeys = [
    'bull:websiteSync:id',
    'bull:websiteSync:events',
    'bull:websiteSync:meta',
    'fastgpt:bull:websiteSync:id',
    'fastgpt:bull:websiteSync:events',
    'fastgpt:bull:websiteSync:meta'
  ];

  console.log('check specific BullMQ keys...');
  for (const key of specificKeys) {
    try {
      const exists = await redis.exists(key);
      if (exists) {
        await redis.del(key);
        totalDeletedKeys++;
        console.log(`delete specific key: ${key}`);
      }
    } catch (error) {
      console.error(`error when deleting key "${key}":`, error);
    }
  }

  console.log(`Redis clear completed, total deleted ${totalDeletedKeys} keys`);
  return totalDeletedKeys;
};

const clearAllWebsiteSyncJobs = async () => {
  console.log('start clear all websiteSync jobs');

  try {
    // 1. get all job status statistics
    const waitingJobs = await websiteSyncQueue.getJobs(['waiting', 'delayed']);
    const activeJobs = await websiteSyncQueue.getJobs(['active']);
    const completedJobs = await websiteSyncQueue.getJobs(['completed']);
    const failedJobs = await websiteSyncQueue.getJobs(['failed']);
    const repeatableJobs = await websiteSyncQueue.getJobSchedulers();

    // 2. delete all schedulers
    for (const scheduler of repeatableJobs) {
      try {
        await websiteSyncQueue.removeJobScheduler(scheduler.name);
        console.log(`delete scheduler: ${scheduler.name}`);
      } catch (error) {
        console.error(`delete scheduler failed (${scheduler.name}):`, error);
      }
    }

    // 3. clear all jobs in queue (including all status jobs)
    await websiteSyncQueue.drain(true); // true parameter means delete delayed jobs

    console.log('websiteSync queue clear completed');

    return {
      clearedJobs:
        waitingJobs.length + activeJobs.length + completedJobs.length + failedJobs.length,
      clearedSchedulers: repeatableJobs.length
    };
  } catch (error) {
    console.error('error when clearing websiteSync queue:', error);
    throw error;
  }
};

const initDatasetSyncData = async () => {
  // 1. find all autoSync datasets
  const datasets = await MongoDataset.find({ autoSync: true }).lean();
  console.log(`find ${datasets.length} datasets need auto sync`);

  let addedJobsCount = 0;
  let addedSchedulersCount = 0;

  // 2. add autoSync datasets to DatasetSync queue
  console.log('add autoSync datasets to DatasetSync queue');

  for (const dataset of datasets) {
    try {
      const datasetId = String(dataset._id);

      // add immediate execution task
      await addDatasetSyncJob({ datasetId });
      addedJobsCount++;
      console.log(`add DatasetSync job: ${datasetId}`);

      // add scheduler
      const time = addHours(new Date(), Math.floor(Math.random() * 23) + 1);
      await retryFn(() => upsertDatasetSyncJobScheduler({ datasetId }, time.getTime()));
      addedSchedulersCount++;
      console.log(`add DatasetSync scheduler: ${datasetId}`);
    } catch (error) {
      console.error(`error when processing dataset (${dataset._id}):`, error);
    }
  }

  // 3. clear all websiteSync jobs
  const clearJobsResult = await clearAllWebsiteSyncJobs();

  // 4. clear all websiteSync related data in Redis
  const deletedRedisKeys = await clearAllWebsiteSyncRedisData();

  // 5. remove nextSyncTime field in database
  console.log('remove nextSyncTime field in database');
  await retryFn(() =>
    MongoDatasetCollection.updateMany(
      {
        teamId: { $in: datasets.map((dataset) => dataset.teamId) },
        datasetId: { $in: datasets.map((dataset) => dataset._id) }
      },
      {
        $unset: {
          nextSyncTime: 1
        }
      }
    )
  );

  const result = {
    autoSyncDatasets: datasets.length,
    addedJobs: addedJobsCount,
    addedSchedulers: addedSchedulersCount,
    deletedRedisKeys,
    ...clearJobsResult
  };

  console.log('migrate completed statistics:', result);
  return result;
};
async function handler(req: NextApiRequest, _res: NextApiResponse) {
  await authCert({ req, authRoot: true });

  const result = await initDatasetSyncData();

  return {
    success: true,
    result
  };
}

export default NextAPI(handler);
