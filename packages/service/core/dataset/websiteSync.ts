import { Processor } from 'bullmq';
import { getQueue, getWorker, QueueNames } from '../../common/bullmq';

export type WebsiteSyncJobData = {
  datasetId: string;
};
export type WebsiteSyncJobReturn = void;

export const websiteSyncQueue = getQueue<WebsiteSyncJobData, WebsiteSyncJobReturn>(
  QueueNames.websiteSync,
  {
    defaultJobOptions: {
      attempts: 3, // retry 3 times
      backoff: {
        type: 'exponential',
        delay: 1000 // delay 1 second between retries
      }
    }
  }
);

export function getWebsiteSyncWorker(
  processor: Processor<WebsiteSyncJobData, WebsiteSyncJobReturn>
) {
  return getWorker<WebsiteSyncJobData, WebsiteSyncJobReturn>(QueueNames.websiteSync, processor, {
    removeOnFail: {
      age: 15 * 24 * 3600, // Keep up to 24 hours
      count: 1000 // Keep up to 8000 jobs
    }
  });
}

export async function addWebsiteSyncJob(data: WebsiteSyncJobData) {
  const datasetId = String(data.datasetId);
  return websiteSyncQueue.add(datasetId, data, { deduplication: { id: datasetId } });
}

export async function getCurrentWebsiteSyncJob(datasetId: string) {
  const jobId = await websiteSyncQueue.getDeduplicationJobId(datasetId);
  if (!jobId) {
    return undefined;
  }
  return websiteSyncQueue.getJob(jobId);
}

const repeatDuration = 86400000; // every day
export async function upsertWebsiteSyncJobScheduler(data: WebsiteSyncJobData) {
  const datasetId = String(data.datasetId);
  return websiteSyncQueue.upsertJobScheduler(
    datasetId,
    {
      every: repeatDuration,
      startDate: new Date().getTime() + repeatDuration // start tomorrow
    },
    {
      name: datasetId,
      data
    }
  );
}

export async function getWebsiteSyncJobScheduler(datasetId: string) {
  return websiteSyncQueue.getJobScheduler(datasetId);
}

export async function removeWebsiteSyncJobScheduler(datasetId: string) {
  return websiteSyncQueue.removeJobScheduler(datasetId);
}
