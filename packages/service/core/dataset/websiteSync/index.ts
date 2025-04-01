import { Processor } from 'bullmq';
import { getQueue, getWorker, QueueNames } from '../../../common/bullmq';
import { DatasetStatusEnum } from '@fastgpt/global/core/dataset/constants';

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
    }
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
    return DatasetStatusEnum.active;
  }
  const job = await websiteSyncQueue.getJob(jobId);
  if (!job) {
    return DatasetStatusEnum.active;
  }

  const jobState = await job.getState();

  if (['waiting-children', 'waiting'].includes(jobState)) {
    return DatasetStatusEnum.waiting;
  }
  if (jobState === 'active') {
    return DatasetStatusEnum.syncing;
  }

  return DatasetStatusEnum.active;
};

// Scheduler setting
const repeatDuration = 24 * 60 * 60 * 1000; // every day
export const upsertWebsiteSyncJobScheduler = (data: WebsiteSyncJobData) => {
  const datasetId = String(data.datasetId);
  return websiteSyncQueue.upsertJobScheduler(
    datasetId,
    {
      every: repeatDuration,
      startDate: new Date().getTime() + repeatDuration // First run tomorrow
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
