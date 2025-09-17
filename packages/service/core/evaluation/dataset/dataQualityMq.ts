import { getQueue, getWorker, QueueNames } from '../../../common/bullmq';
import { type Processor } from 'bullmq';
import { addLog } from '../../../common/system/log';
import {
  createJobCleaner,
  type JobCleanupResult,
  type JobCleanupOptions
} from '../utils/jobCleanup';

export type EvalDatasetDataQualityData = {
  dataId: string;
  evaluationModel: string;
};

export const evalDatasetDataQualityQueue = getQueue<EvalDatasetDataQualityData>(
  QueueNames.evalDatasetDataQuality,
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

const concurrency = process.env.EVAL_DATA_QUALITY_CONCURRENCY
  ? Number(process.env.EVAL_DATA_QUALITY_CONCURRENCY)
  : 2;

export const getEvalDatasetDataQualityWorker = (
  processor: Processor<EvalDatasetDataQualityData>
) => {
  return getWorker<EvalDatasetDataQualityData>(QueueNames.evalDatasetDataQuality, processor, {
    removeOnFail: {
      count: 1000 // Keep last 1000 failed jobs
    },
    concurrency: concurrency
  });
};

export const addEvalDatasetDataQualityJob = (data: EvalDatasetDataQualityData) => {
  const dataId = String(data.dataId);

  return evalDatasetDataQualityQueue.add(dataId, data, { deduplication: { id: dataId } });
};

export const checkEvalDatasetDataQualityJobActive = async (dataId: string): Promise<boolean> => {
  try {
    const jobId = await evalDatasetDataQualityQueue.getDeduplicationJobId(String(dataId));
    if (!jobId) return false;

    const job = await evalDatasetDataQualityQueue.getJob(jobId);
    if (!job) return false;

    const jobState = await job.getState();
    return ['waiting', 'delayed', 'prioritized', 'active'].includes(jobState);
  } catch (error) {
    addLog.error('Failed to check eval dataset data quality job status', { dataId, error });
    return false;
  }
};

export const checkEvalDatasetDataQualityJobInactive = async (dataId: string): Promise<boolean> => {
  try {
    const jobId = await evalDatasetDataQualityQueue.getDeduplicationJobId(String(dataId));
    if (!jobId) return false;

    const job = await evalDatasetDataQualityQueue.getJob(jobId);
    if (!job) return false;

    const jobState = await job.getState();
    return ['completed', 'failed'].includes(jobState);
  } catch (error) {
    addLog.error('Failed to check eval dataset data quality job inactive status', {
      dataId,
      error
    });
    return false;
  }
};

export const removeEvalDatasetDataQualityJobsRobust = async (
  dataIds: string[],
  options?: JobCleanupOptions
): Promise<JobCleanupResult> => {
  const cleaner = createJobCleaner(options);

  const filterFn = (job: any) => {
    return dataIds.includes(String(job.data?.dataId));
  };

  const result = await cleaner.cleanAllJobsByFilter(
    evalDatasetDataQualityQueue,
    filterFn,
    QueueNames.evalDatasetDataQuality
  );

  addLog.info('Evaluation DatasetData quality jobs cleanup completed', {
    dataIds: dataIds.length,
    result
  });

  return result;
};
