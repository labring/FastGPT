import { NextAPI } from '@/service/middleware/entry';
import { retryFn } from '@fastgpt/global/common/system/utils';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { websiteSyncQueue } from './initv494';
import {
  upsertDatasetSyncJobScheduler,
  addDatasetSyncJob
} from '@fastgpt/service/core/dataset/datasetSync';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { addHours } from 'date-fns';
import { type NextApiRequest, type NextApiResponse } from 'next';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
const logger = getLogger(LogCategories.SYSTEM);

const clearAllWebsiteSyncJobs = async () => {
  logger.info('start clear all websiteSync jobs');

  try {
    // 1. get all job status statistics
    const repeatableJobs = await websiteSyncQueue.getJobSchedulers();

    // 2. delete all schedulers
    for (const scheduler of repeatableJobs) {
      try {
        await websiteSyncQueue.removeJobScheduler(scheduler.name);
        logger.info(`delete scheduler: ${scheduler.name}`);
      } catch (error) {
        logger.error(`delete scheduler failed (${scheduler.name}):`, { error: error });
      }
    }

    // 3. clear all jobs in queue (including all status jobs)
    await websiteSyncQueue.drain(true); // true parameter means delete delayed jobs

    logger.info('websiteSync queue clear completed');
  } catch (error) {
    logger.error('error when clearing websiteSync queue:', { error: error });
    throw error;
  }
};

const initDatasetSyncData = async () => {
  // 1. find all autoSync datasets
  const datasets = await MongoDataset.find({ autoSync: true }).lean();
  logger.info(`find ${datasets.length} datasets need auto sync`);

  let addedJobsCount = 0;
  let addedSchedulersCount = 0;

  // 2. add autoSync datasets to DatasetSync queue
  for (const dataset of datasets) {
    try {
      const datasetId = String(dataset._id);

      // add immediate execution task
      await addDatasetSyncJob({ datasetId });
      addedJobsCount++;

      // add scheduler
      const time = addHours(new Date(), Math.floor(Math.random() * 5) + 1);
      await retryFn(() => upsertDatasetSyncJobScheduler({ datasetId }, time.getTime()));
      addedSchedulersCount++;
      logger.info(`add DatasetSync scheduler: ${datasetId}`);
    } catch (error) {
      logger.error(`error when processing dataset (${dataset._id}):`, { error: error });
    }
  }

  // 3. clear all websiteSync jobs
  const clearJobsResult = await clearAllWebsiteSyncJobs();

  // 4. remove nextSyncTime field in database
  logger.info('remove nextSyncTime field in database');
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
    addedSchedulers: addedSchedulersCount
  };

  logger.info('migrate completed statistics:', result);
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
