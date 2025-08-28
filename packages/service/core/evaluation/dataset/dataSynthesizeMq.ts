import { getQueue, getWorker, QueueNames } from '../../../common/bullmq';
import { type Processor } from 'bullmq';
import { addLog } from '../../../common/system/log';

export type EvalDatasetDataSynthesizeData = {
  dataId: string;
  intelligentGenerationModel: string;
  evalDatasetCollectionId: string;
};

export const evalDatasetDataSynthesizeQueue = getQueue<EvalDatasetDataSynthesizeData>(
  QueueNames.evalDatasetDataSynthesize,
  {
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000
      }
    }
  }
);

const concurrency = process.env.EVAL_DATASET_DATA_SYNTHESIZE_CONCURRENCY
  ? Number(process.env.EVAL_DATASET_DATA_SYNTHESIZE_CONCURRENCY)
  : 5;

export const getEvalDatasetDataSynthesizeWorker = (
  processor: Processor<EvalDatasetDataSynthesizeData>
) => {
  return getWorker<EvalDatasetDataSynthesizeData>(QueueNames.evalDatasetDataSynthesize, processor, {
    removeOnFail: {
      count: 1000 // Keep last 1000 failed jobs for debugging
    },
    concurrency: concurrency
  });
};

export const addEvalDatasetDataSynthesizeJob = (data: EvalDatasetDataSynthesizeData) => {
  const jobId = `synthesize-${data.dataId}-${Date.now()}`;

  return evalDatasetDataSynthesizeQueue.add(jobId, data, {
    deduplication: { id: jobId }
  });
};

export const checkEvalDatasetDataSynthesizeJobActive = async (
  evalDatasetCollectionId: string
): Promise<boolean> => {
  try {
    const jobs = await evalDatasetDataSynthesizeQueue.getJobs(['waiting', 'active', 'delayed']);
    return jobs.some((job) => job.data.evalDatasetCollectionId === evalDatasetCollectionId);
  } catch (error) {
    addLog.error('Failed to check eval dataset data synthesize job status', {
      evalDatasetCollectionId: evalDatasetCollectionId,
      error
    });
    return false;
  }
};

export const removeEvalDatasetDataSynthesizeJobs = async (
  evalDatasetCollectionId: string
): Promise<boolean> => {
  try {
    const jobs = await evalDatasetDataSynthesizeQueue.getJobs([
      'waiting',
      'delayed',
      'prioritized'
    ]);
    const jobsToRemove = jobs.filter(
      (job) => job.data.evalDatasetCollectionId === evalDatasetCollectionId
    );

    await Promise.all(jobsToRemove.map((job) => job.remove()));

    addLog.info('Data synthesize jobs removed successfully', {
      evalDatasetCollectionId: evalDatasetCollectionId,
      removedCount: jobsToRemove.length
    });
    return true;
  } catch (error) {
    addLog.error('Failed to remove data synthesize jobs', {
      evalDatasetCollectionId: evalDatasetCollectionId,
      error
    });
    return false;
  }
};
