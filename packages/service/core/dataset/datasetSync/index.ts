import { type JobSchedulerJson, type Processor } from 'bullmq';
import { getQueue, getWorker, QueueNames } from '../../../common/bullmq';
import { DatasetStatusEnum } from '@fastgpt/global/core/dataset/constants';
import { MongoDataset } from '../schema';
import { getLogger, LogCategories } from '../../../common/logger';

export type DatasetSyncJobData = {
  datasetId: string;
};

const logger = getLogger(LogCategories.MODULE.DATASET);

export const datasetSyncQueue = getQueue<DatasetSyncJobData>(QueueNames.datasetSync, {
  defaultJobOptions: {
    attempts: 3, // retry 3 times
    backoff: {
      type: 'exponential',
      delay: 1000 // delay 1 second between retries
    }
  }
});
export const getDatasetSyncWorker = (processor: Processor<DatasetSyncJobData>) => {
  return getWorker<DatasetSyncJobData>(QueueNames.datasetSync, processor, {
    removeOnFail: {
      age: 15 * 24 * 60 * 60, // Keep up to 15 days
      count: 1000 // Keep up to 1000 jobs
    },
    concurrency: 1 // Set worker to process only 1 job at a time
  });
};

export const addDatasetSyncJob = (data: DatasetSyncJobData) => {
  const datasetId = String(data.datasetId);
  // deduplication: make sure only 1 job
  return datasetSyncQueue.add(datasetId, data, { deduplication: { id: datasetId } });
};

export const getDatasetSyncDatasetStatus = async (datasetId: string) => {
  const jobId = await datasetSyncQueue.getDeduplicationJobId(datasetId);
  if (!jobId) {
    return {
      status: DatasetStatusEnum.active,
      errorMsg: undefined
    };
  }
  const job = await datasetSyncQueue.getJob(jobId);
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
export const upsertDatasetSyncJobScheduler = (data: DatasetSyncJobData, startDate?: number) => {
  const datasetId = String(data.datasetId);

  return datasetSyncQueue.upsertJobScheduler(
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

export const getDatasetSyncJobScheduler = (datasetId: string) => {
  return datasetSyncQueue.getJobScheduler(String(datasetId));
};

export const removeDatasetSyncJobScheduler = (datasetId: string) => {
  return datasetSyncQueue.removeJobScheduler(String(datasetId));
};

export type DatasetSyncSchedulerReconcileResult = {
  autoSyncDatasetCount: number;
  schedulerCount: number;
  createdSchedulerCount: number;
  createdDatasetIds: string[];
};

/**
 * 以 Mongo `autoSync=true` 作为期望态，补齐缺失的 BullMQ datasetSync scheduler。
 *
 * 该函数只增加缺失 scheduler，不修改 Mongo `autoSync`，也不移除 Redis 中已有 scheduler/job。
 */
export const reconcileDatasetSyncSchedulers =
  async (): Promise<DatasetSyncSchedulerReconcileResult> => {
    const autoSyncDatasets = await MongoDataset.find(
      {
        autoSync: true,
        $or: [{ deleteTime: null }, { deleteTime: { $exists: false } }]
      },
      '_id'
    ).lean();
    const autoSyncDatasetIds = new Set(autoSyncDatasets.map((dataset) => String(dataset._id)));

    const schedulers = (await datasetSyncQueue.getJobSchedulers(
      0,
      -1,
      true
    )) as JobSchedulerJson<DatasetSyncJobData>[];
    const schedulerIds = new Set(
      schedulers.map((scheduler) => String(scheduler.key)).filter(Boolean)
    );

    const createdDatasetIds: string[] = [];

    for (const datasetId of autoSyncDatasetIds) {
      if (schedulerIds.has(datasetId)) continue;

      await upsertDatasetSyncJobScheduler({ datasetId });
      createdDatasetIds.push(datasetId);
    }

    const result = {
      autoSyncDatasetCount: autoSyncDatasetIds.size,
      schedulerCount: schedulers.length,
      createdSchedulerCount: createdDatasetIds.length,
      createdDatasetIds
    };

    logger.info('Dataset sync scheduler reconcile finished', result);
    return result;
  };
