import { type Processor } from 'bullmq';
import { getQueue, getWorker, QueueNames } from '../../../common/bullmq';
import { DatasetStatusEnum } from '@fastgpt/global/core/dataset/constants';

export type DatasetSyncJobData = {
  datasetId: string;
};

export const apiDatasetSyncQueue = getQueue<DatasetSyncJobData>(QueueNames.apiDatasetSync, {
  defaultJobOptions: {
    attempts: 3, // retry 3 times
    backoff: {
      type: 'exponential',
      delay: 1000 // delay 1 second between retries
    }
  }
});
export const getApiDatasetSyncWorker = (processor: Processor<DatasetSyncJobData>) => {
  return getWorker<DatasetSyncJobData>(QueueNames.apiDatasetSync, processor, {
    removeOnFail: {
      age: 15 * 24 * 60 * 60, // Keep up to 15 days
      count: 1000 // Keep up to 1000 jobs
    },
    concurrency: 1 // Set worker to process only 1 job at a time
  });
};

export const addApiDatasetSyncJob = (data: DatasetSyncJobData) => {
  const datasetId = String(data.datasetId);
  // deduplication: make sure only 1 job
  return apiDatasetSyncQueue.add(datasetId, data, { deduplication: { id: datasetId } });
};

export const getApiDatasetSyncDatasetStatus = async (datasetId: string) => {
  const jobId = await apiDatasetSyncQueue.getDeduplicationJobId(datasetId);
  if (!jobId) {
    return {
      status: DatasetStatusEnum.active,
      errorMsg: undefined
    };
  }
  const job = await apiDatasetSyncQueue.getJob(jobId);
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
export const upsertApiDatasetSyncJobScheduler = (data: DatasetSyncJobData, startDate?: number) => {
  const datasetId = String(data.datasetId);

  return apiDatasetSyncQueue.upsertJobScheduler(
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

export const getApiDatasetSyncJobScheduler = (datasetId: string) => {
  return apiDatasetSyncQueue.getJobScheduler(String(datasetId));
};

export const removeApiDatasetSyncJobScheduler = (datasetId: string) => {
  return apiDatasetSyncQueue.removeJobScheduler(String(datasetId));
};
