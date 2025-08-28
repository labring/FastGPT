import { getQueue, getWorker, QueueNames } from '../../../common/bullmq';
import { type Processor } from 'bullmq';
import { addLog } from '../../../common/system/log';

export type EvalDatasetSmartGenerateData = {
  datasetCollectionIds: string[];
  count?: number;
  keywords?: string[];
  intelligentGenerationModel: string;
  evalDatasetCollectionId: string;
};

export const evalDatasetSmartGenerateQueue = getQueue<EvalDatasetSmartGenerateData>(
  QueueNames.evalDatasetSmartGenerate,
  {
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      }
    }
  }
);

const concurrency = process.env.EVAL_DATASET_SMART_GENERATE_CONCURRENCY
  ? Number(process.env.EVAL_DATASET_SMART_GENERATE_CONCURRENCY)
  : 2;

export const getEvalDatasetSmartGenerateWorker = (
  processor: Processor<EvalDatasetSmartGenerateData>
) => {
  return getWorker<EvalDatasetSmartGenerateData>(QueueNames.evalDatasetSmartGenerate, processor, {
    removeOnFail: {
      count: 1000 // Keep last 1000 failed jobs for debugging
    },
    concurrency: concurrency
  });
};

export const addEvalDatasetSmartGenerateJob = (data: EvalDatasetSmartGenerateData) => {
  const jobId = `smartgen-${data.evalDatasetCollectionId}-${Date.now()}`;

  return evalDatasetSmartGenerateQueue.add(jobId, data, {
    deduplication: { id: jobId }
  });
};

export const checkEvalDatasetSmartGenerateJobActive = async (
  evalDatasetCollectionId: string
): Promise<boolean> => {
  try {
    const jobs = await evalDatasetSmartGenerateQueue.getJobs(['waiting', 'active', 'delayed']);
    return jobs.some((job) => job.data.evalDatasetCollectionId === evalDatasetCollectionId);
  } catch (error) {
    addLog.error('Failed to check eval dataset smart generate job status', {
      evalDatasetCollectionId: evalDatasetCollectionId,
      error
    });
    return false;
  }
};

export const removeEvalDatasetSmartGenerateJobs = async (
  evalDatasetCollectionId: string
): Promise<boolean> => {
  try {
    const jobs = await evalDatasetSmartGenerateQueue.getJobs(['waiting', 'delayed', 'prioritized']);
    const jobsToRemove = jobs.filter(
      (job) => job.data.evalDatasetCollectionId === evalDatasetCollectionId
    );

    await Promise.all(jobsToRemove.map((job) => job.remove()));

    addLog.info('Smart generate jobs removed successfully', {
      evalDatasetCollectionId: evalDatasetCollectionId,
      removedCount: jobsToRemove.length
    });
    return true;
  } catch (error) {
    addLog.error('Failed to remove smart generate jobs', {
      evalDatasetCollectionId: evalDatasetCollectionId,
      error
    });
    return false;
  }
};
