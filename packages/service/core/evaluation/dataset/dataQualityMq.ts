import { getQueue, getWorker, QueueNames } from '../../../common/bullmq';
import { type Processor } from 'bullmq';
import { addLog } from '../../../common/system/log';

export type EvalDatasetDataQualityData = {
  dataId: string;
  evalModel: string;
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

export const removeEvalDatasetDataQualityJob = async (dataId: string): Promise<boolean> => {
  const formatDataId = String(dataId);
  try {
    const jobId = await evalDatasetDataQualityQueue.getDeduplicationJobId(formatDataId);
    if (!jobId) {
      addLog.warn('No job found to remove', { dataId });
      return false;
    }

    const job = await evalDatasetDataQualityQueue.getJob(jobId);
    if (!job) {
      addLog.warn('Job not found in queue', { dataId, jobId });
      return false;
    }

    const jobState = await job.getState();

    if (['waiting', 'delayed', 'prioritized'].includes(jobState)) {
      await job.remove();
      addLog.info('Eval dataset data quality job removed successfully', {
        dataId,
        jobId,
        jobState
      });
      return true;
    } else {
      addLog.warn('Cannot remove active or completed job', { dataId, jobId, jobState });
      return false;
    }
  } catch (error) {
    addLog.error('Failed to remove eval dataset data quality job', { dataId, error });
    return false;
  }
};
