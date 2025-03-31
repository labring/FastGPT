import { getQueue } from '..';
import { DatasetSchemaType } from '@fastgpt/global/core/dataset/type';

export const WebsiteSyncQueueName = 'websiteSync';

export type WebsiteSyncJobData = {
  dataset: DatasetSchemaType;
  billId?: string;
};
export type WebsiteSyncJobReturn = void;

export const websiteSyncQueue = getQueue<WebsiteSyncJobData, WebsiteSyncJobReturn>(
  WebsiteSyncQueueName
);

export async function addWebsiteSyncJob(data: WebsiteSyncJobData) {
  const datasetId = data.dataset._id.toString();
  return websiteSyncQueue.add(data.dataset.name, data, { deduplication: { id: datasetId } });
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
  const datasetId = data.dataset._id.toString();
  return websiteSyncQueue.upsertJobScheduler(
    datasetId,
    {
      every: repeatDuration,
      startDate: new Date().getTime() + repeatDuration // start tomorrow
    },
    {
      name: data.dataset.name,
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
