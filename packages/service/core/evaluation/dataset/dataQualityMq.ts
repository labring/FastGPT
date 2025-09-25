import { getQueue, getWorker, QueueNames } from '../../../common/bullmq';
import { type Processor, type Queue } from 'bullmq';
import { addLog } from '../../../common/system/log';
import { MongoEvalDatasetData } from './evalDatasetDataSchema';
import { EvalDatasetDataQualityStatusEnum } from '@fastgpt/global/core/evaluation/dataset/constants';
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
  QueueNames.evalDatasetDataQuality
);

const concurrency = global.systemEnv?.evalConfig?.dataQualityConcurrency || 2;

export const getEvalDatasetDataQualityWorker = (
  processor: Processor<EvalDatasetDataQualityData>
) => {
  const worker = getWorker<EvalDatasetDataQualityData>(
    QueueNames.evalDatasetDataQuality,
    processor,
    {
      maxStalledCount: 3,
      removeOnFail: {
        count: 1000 // Keep last 1000 failed jobs
      },
      concurrency: concurrency
    }
  );

  // When a job stalls (moves from active to waiting state)
  worker.on('stalled', async (jobId: string) => {
    try {
      const job = await evalDatasetDataQualityQueue.getJob(jobId);
      if (!job) return;

      addLog.warn('Data quality job stalled', {
        jobId: job.id,
        dataId: job.data.dataId
      });

      await MongoEvalDatasetData.findByIdAndUpdate(job.data.dataId, {
        $set: {
          'qualityMetadata.status': EvalDatasetDataQualityStatusEnum.queuing,
          'qualityMetadata.queueTime': new Date()
        }
      });

      addLog.info('Updated stalled job status to queuing', {
        jobId: job.id,
        dataId: job.data.dataId
      });
    } catch (error) {
      addLog.error('Failed to handle stalled job', {
        jobId,
        error
      });
    }
  });

  worker.on('failed', async (job, err) => {
    try {
      if (!job) {
        addLog.error('Data quality job failed but job is undefined', { error: err });
        return;
      }

      addLog.error('Data quality job failed', {
        jobId: job.id,
        dataId: job.data.dataId,
        error: err
      });

      // Check if failure is due to permanent stall limit exceeded
      const isStallLimitExceeded =
        err &&
        (err.message?.includes('stalled more than allowable limit') ||
          err.message?.includes('job stalled more than'));

      if (isStallLimitExceeded) {
        await MongoEvalDatasetData.findByIdAndUpdate(job.data.dataId, {
          $set: {
            'qualityMetadata.status': EvalDatasetDataQualityStatusEnum.error,
            'qualityMetadata.error': 'Job stalled more than allowable limit and failed permanently',
            'qualityMetadata.finishTime': new Date()
          }
        });

        addLog.error('Updated permanently failed job status to error', {
          jobId: job.id,
          dataId: job.data.dataId,
          reason: 'stall limit exceeded'
        });
      }
      // For other failure types, let the processor handle the status update
    } catch (updateError) {
      addLog.error('Failed to handle failed job', {
        jobId: job?.id,
        dataId: job?.data?.dataId,
        error: updateError
      });
    }
  });

  return worker;
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

export const checkBullMQHealth = async (queue: Queue, queueName: string): Promise<void> => {
  try {
    await queue.isPaused();
    await queue.getWaiting(0, 0);
  } catch (error) {
    addLog.error(`BullMQ ${queueName} queue health check failed:`, error);
    throw new Error(
      `BullMQ ${queueName} queue is not responding. Please check Redis connection and queue status.`
    );
  }
};

export const checkEvalDatasetDataQualityQueueHealth = (): Promise<void> => {
  return checkBullMQHealth(evalDatasetDataQualityQueue, 'quality');
};
