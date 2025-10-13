import { getQueue, getWorker, QueueNames } from '../../../common/bullmq';
import { type Processor } from 'bullmq';
import { addLog } from '../../../common/system/log';
import { checkBullMQHealth } from './dataQualityMq';
import {
  createJobCleaner,
  type JobCleanupResult,
  type JobCleanupOptions
} from '../utils/jobCleanup';

export type EvalDatasetDataSynthesizeData = {
  dataId: string;
  intelligentGenerationModel: string;
  evalDatasetCollectionId: string;
};

export const evalDatasetDataSynthesizeQueue = getQueue<EvalDatasetDataSynthesizeData>(
  QueueNames.evalDatasetDataSynthesize
);

const concurrency = global.systemEnv?.evalConfig?.datasetDataSynthesizeConcurrency || 5;

export const getEvalDatasetDataSynthesizeWorker = (
  processor: Processor<EvalDatasetDataSynthesizeData>
) => {
  return getWorker<EvalDatasetDataSynthesizeData>(QueueNames.evalDatasetDataSynthesize, processor, {
    maxStalledCount: global.systemEnv?.evalConfig?.maxStalledCount || 3,
    removeOnFail: {},
    concurrency: concurrency
  });
};

export const addEvalDatasetDataSynthesizeBulk = (dataArray: EvalDatasetDataSynthesizeData[]) => {
  const jobs = dataArray.map((data, index) => ({
    name: `synthesize-${data.dataId}-${Date.now()}-${index}`,
    data,
    opts: {
      deduplication: { id: `synthesize-${data.dataId}-${Date.now()}-${index}` }
    }
  }));

  return evalDatasetDataSynthesizeQueue.addBulk(jobs);
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

export const removeEvalDatasetDataSynthesizeJobsRobust = async (
  evalDatasetCollectionIds: string[],
  options?: JobCleanupOptions
): Promise<JobCleanupResult> => {
  const cleaner = createJobCleaner(options);

  const filterFn = (job: any) => {
    return evalDatasetCollectionIds.includes(String(job.data?.evalDatasetCollectionId));
  };

  const result = await cleaner.cleanAllJobsByFilter(
    evalDatasetDataSynthesizeQueue,
    filterFn,
    QueueNames.evalDatasetDataSynthesize
  );

  addLog.info('Evaluation DatasetData synthesize jobs cleanup completed', {
    evalDatasetCollectionIds: evalDatasetCollectionIds.length,
    result
  });

  return result;
};

export const checkEvalDatasetDataSynthesizeQueueHealth = (): Promise<void> => {
  return checkBullMQHealth(evalDatasetDataSynthesizeQueue, 'synthesis');
};
