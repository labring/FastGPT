import { NextAPI } from '@/service/middleware/entry';
import { retryFn } from '@fastgpt/global/common/system/utils';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { addHours } from 'date-fns';
import { type NextApiRequest, type NextApiResponse } from 'next';

import { type Processor } from '@fastgpt/service/common/bullmq';
import { getQueue, getWorker, QueueNames } from '@fastgpt/service/common/bullmq';
import { DatasetStatusEnum } from '@fastgpt/global/core/dataset/constants';

const initWebsiteSyncData = async () => {
  // find out all website dataset
  const datasets = await MongoDataset.find({ type: DatasetTypeEnum.websiteDataset }).lean();

  console.log('更新站点同步的定时器');
  // Add scheduler for all website dataset
  await Promise.all(
    datasets.map((dataset) => {
      if (dataset.autoSync) {
        // 随机生成一个往后 1～24 小时的时间
        const time = addHours(new Date(), Math.floor(Math.random() * 23) + 1);
        return retryFn(() =>
          upsertWebsiteSyncJobScheduler({ datasetId: String(dataset._id) }, time.getTime())
        );
      }
    })
  );

  console.log('移除站点同步集合的定时器');
  // Remove all nextSyncTime
  await retryFn(() =>
    MongoDatasetCollection.updateMany(
      {
        teamId: datasets.map((dataset) => dataset.teamId),
        datasetId: datasets.map((dataset) => dataset._id)
      },
      {
        $unset: {
          nextSyncTime: 1
        }
      }
    )
  );
};
async function handler(req: NextApiRequest, _res: NextApiResponse) {
  await authCert({ req, authRoot: true });

  await initWebsiteSyncData();

  return { success: true };
}

export default NextAPI(handler);

export type WebsiteSyncJobData = {
  datasetId: string;
};

export const websiteSyncQueue = getQueue<WebsiteSyncJobData>(QueueNames.websiteSync, {
  defaultJobOptions: {
    attempts: 3, // retry 3 times
    backoff: {
      type: 'exponential',
      delay: 1000 // delay 1 second between retries
    }
  }
});
export const getWebsiteSyncWorker = (processor: Processor<WebsiteSyncJobData>) => {
  return getWorker<WebsiteSyncJobData>(QueueNames.websiteSync, processor, {
    removeOnFail: {
      age: 15 * 24 * 60 * 60, // Keep up to 15 days
      count: 1000 // Keep up to 1000 jobs
    },
    concurrency: 1 // Set worker to process only 1 job at a time
  });
};

export const addWebsiteSyncJob = (data: WebsiteSyncJobData) => {
  const datasetId = String(data.datasetId);
  // deduplication: make sure only 1 job
  return websiteSyncQueue.add(datasetId, data, { deduplication: { id: datasetId } });
};

export const getWebsiteSyncDatasetStatus = async (datasetId: string) => {
  const jobId = await websiteSyncQueue.getDeduplicationJobId(datasetId);
  if (!jobId) {
    return {
      status: DatasetStatusEnum.active,
      errorMsg: undefined
    };
  }
  const job = await websiteSyncQueue.getJob(jobId);
  if (!job) {
    return {
      status: DatasetStatusEnum.active,
      errorMsg: undefined
    };
  }

  const jobState = await job.getState();

  if (jobState === 'failed' || jobState === 'unknown') {
    return {
      status: DatasetStatusEnum.error,
      errorMsg: job.failedReason
    };
  }
  if (['waiting-children', 'waiting'].includes(jobState)) {
    return {
      status: DatasetStatusEnum.waiting,
      errorMsg: undefined
    };
  }
  if (jobState === 'active') {
    return {
      status: DatasetStatusEnum.syncing,
      errorMsg: undefined
    };
  }

  return {
    status: DatasetStatusEnum.active,
    errorMsg: undefined
  };
};

// Scheduler setting
const repeatDuration = 24 * 60 * 60 * 1000; // every day
export const upsertWebsiteSyncJobScheduler = (data: WebsiteSyncJobData, startDate?: number) => {
  const datasetId = String(data.datasetId);

  return websiteSyncQueue.upsertJobScheduler(
    datasetId,
    {
      every: repeatDuration,
      startDate: startDate || new Date().getTime() + repeatDuration // First run tomorrow
    },
    {
      name: datasetId,
      data
    }
  );
};

export const getWebsiteSyncJobScheduler = (datasetId: string) => {
  return websiteSyncQueue.getJobScheduler(String(datasetId));
};

export const removeWebsiteSyncJobScheduler = (datasetId: string) => {
  return websiteSyncQueue.removeJobScheduler(String(datasetId));
};
