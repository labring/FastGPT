import { addLog } from '../../../common/system/log';
import { getQueue, getWorker, QueueNames } from '../../../common/bullmq';
import type {
  EvaluationTaskJobData,
  EvaluationItemJobData
} from '@fastgpt/global/core/evaluation/type';
import { EvaluationStatusEnum } from '@fastgpt/global/core/evaluation/constants';
import {
  createJobCleaner,
  type JobCleanupResult,
  type JobCleanupOptions
} from '../utils/jobCleanup';
import { MongoEvaluation } from './schema';
import { getErrText } from '@fastgpt/global/common/error/utils';

export const evaluationTaskQueue = getQueue<EvaluationTaskJobData>(QueueNames.evalTask, {
  defaultJobOptions: {
    attempts: 3, // Enable retry for task level
    backoff: {
      type: 'exponential',
      delay: 2000
    },
    removeOnComplete: 100,
    removeOnFail: 100
  }
});

export const evaluationItemQueue = getQueue<EvaluationItemJobData>(QueueNames.evalTaskItem, {
  defaultJobOptions: {
    attempts: (global.systemEnv?.evalConfig?.caseMaxRetry || 3) + 1, // Enable retry: max 4 attempts (1 initial + 3 retries)
    backoff: {
      type: 'exponential',
      delay: 1000 // Initial delay 1s, exponential backoff
    },
    removeOnComplete: 500,
    removeOnFail: 500
  }
});

export const getEvaluationTaskWorker = (processor: any) => {
  const worker = getWorker<EvaluationTaskJobData>(QueueNames.evalTask, processor, {
    concurrency: global.systemEnv?.evalConfig?.taskConcurrency || 3,
    stalledInterval: 30000, // 30 seconds
    maxStalledCount: 1 // BullMQ recommended
  });

  worker.on('stalled', async (jobId: string) => {
    const job = await evaluationTaskQueue.getJob(jobId);
    addLog.warn('[Evaluation] Task job stalled, will be retried', {
      jobId,
      evalId: job?.data?.evalId
    });
  });

  worker.on('failed', async (job, error) => {
    try {
      const evalId = job?.data.evalId;
      addLog.error('[Evaluation] Task job failed after all retries', {
        jobId: job?.id,
        evalId,
        error
      });
      await MongoEvaluation.updateOne(
        { _id: evalId },
        {
          $set: {
            errorMessage: getErrText(error),
            finishTime: new Date()
          }
        }
      );
    } catch (updateError) {
      addLog.error('[Evaluation] Task job failed after all retries (could not get job data)', {
        jobId: job?.id,
        error,
        updateError
      });
    }
  });

  return worker;
};

export const getEvaluationItemWorker = (processor: any) => {
  const worker = getWorker<EvaluationItemJobData>(QueueNames.evalTaskItem, processor, {
    concurrency: global.systemEnv?.evalConfig?.caseConcurrency || 10,
    stalledInterval: 30000, // 30 seconds for faster recovery
    maxStalledCount: 1 // BullMQ recommended
  });
  worker.on('stalled', async (jobId) => {
    try {
      const job = await evaluationItemQueue.getJob(jobId);
      addLog.warn('[Evaluation] Item job stalled, will be retried', {
        jobId,
        evalId: job?.data?.evalId,
        evalItemId: job?.data?.evalItemId
      });
    } catch (error) {
      addLog.warn('[Evaluation] Item job stalled, will be retried (could not get job data)', {
        jobId,
        error
      });
    }
  });
  worker.on('failed', async (job, error) => {
    // Handle failed items and check task completion

    try {
      const evalId = job?.data?.evalId;
      const evalItemId = job?.data?.evalItemId;
      // Update item status to error
      if (evalItemId) {
        const { MongoEvalItem } = await import('./schema');
        await MongoEvalItem.updateOne(
          { _id: evalItemId },
          {
            $set: {
              errorMessage: getErrText(error),
              finishTime: new Date(),
              'metadata.status': EvaluationStatusEnum.error
            }
          }
        );
      }
      // Check task completion after failure
      if (evalId) {
        addLog.debug('[Evaluation] Checking task completion after item failure', {
          jobId: job?.id,
          evalId,
          evalItemId,
          error
        });

        // Check task completion (avoid circular dependency)
        const { finishEvaluationTask } = await import('./processor');
        await finishEvaluationTask(evalId);
      }
    } catch (finishError) {
      addLog.warn('[Evaluation] Could not retrieve job data for failed job', {
        jobId: job?.id,
        finishError
      });
    }
  });

  worker.on('active', async (job) => {
    try {
      const evalId = job?.data?.evalId;
      const evalItemId = job?.data?.evalItemId;
      if (evalItemId) {
        addLog.debug('[Evaluation] Item job started, updating status to evaluating', {
          jobId: job?.id,
          evalId,
          evalItemId
        });

        // Update item status to evaluating
        const { MongoEvalItem } = await import('./schema');
        await MongoEvalItem.updateOne(
          { _id: evalItemId },
          {
            $set: {
              'metadata.status': EvaluationStatusEnum.evaluating
            },
            $unset: {
              finishTime: 1,
              errorMessage: 1
            }
          }
        );
      }
    } catch (error) {
      addLog.error('[Evaluation] Error in active event handler', {
        jobId: job?.id,
        error
      });
    }
  });

  worker.on('completed', async (job) => {
    try {
      const evalId = job?.data?.evalId;
      const evalItemId = job?.data?.evalItemId;
      if (evalId && evalItemId) {
        addLog.debug(
          '[Evaluation] Item completed, updating metadata and checking task completion',
          {
            jobId: job?.id,
            evalId,
            evalItemId
          }
        );

        // Update item status to completed
        const { MongoEvalItem } = await import('./schema');
        await MongoEvalItem.updateOne(
          { _id: evalItemId },
          {
            $set: {
              'metadata.status': EvaluationStatusEnum.completed,
              finishTime: new Date()
            }
          }
        );

        // Check task completion (avoid circular dependency)
        const { finishEvaluationTask } = await import('./processor');
        await finishEvaluationTask(job.data.evalId);
      }
    } catch (error) {
      addLog.error('[Evaluation] Error in completed event handler', {
        jobId: job?.id,
        error
      });
    }
  });
};

export const removeEvaluationTaskJob = async (
  evalId: string,
  options?: JobCleanupOptions
): Promise<JobCleanupResult> => {
  const cleaner = createJobCleaner(options);

  const filterFn = (job: any) => {
    return String(job.data?.evalId) === String(evalId);
  };

  const result = await cleaner.cleanAllJobsByFilter(
    evaluationTaskQueue,
    filterFn,
    QueueNames.evalTask
  );

  addLog.debug('Evaluation task jobs cleanup completed', {
    evalId,
    result
  });

  return result;
};

export const removeEvaluationItemJobs = async (
  evalId: string,
  options?: JobCleanupOptions
): Promise<JobCleanupResult> => {
  const cleaner = createJobCleaner(options);

  const filterFn = (job: any) => {
    return String(job.data?.evalId) === String(evalId);
  };

  const result = await cleaner.cleanAllJobsByFilter(
    evaluationItemQueue,
    filterFn,
    QueueNames.evalTaskItem
  );

  addLog.debug('Evaluation item jobs cleanup completed', {
    evalId,
    result
  });

  return result;
};

export const removeEvaluationItemJobsByItemId = async (
  evalItemId: string,
  options?: JobCleanupOptions
): Promise<JobCleanupResult> => {
  const cleaner = createJobCleaner(options);

  const filterFn = (job: any) => {
    return String(job.data?.evalItemId) === String(evalItemId);
  };

  const result = await cleaner.cleanAllJobsByFilter(
    evaluationItemQueue,
    filterFn,
    QueueNames.evalTaskItem
  );

  addLog.debug('Evaluation item jobs cleanup completed for specific item', {
    evalItemId,
    result
  });

  return result;
};

export const addEvaluationTaskJob = (data: EvaluationTaskJobData) => {
  const evalId = String(data.evalId);

  return evaluationTaskQueue.add(evalId, data, { deduplication: { id: evalId, ttl: 5000 } });
};

export const addEvaluationItemJob = (data: EvaluationItemJobData, options?: { delay?: number }) => {
  const evalItemId = String(data.evalItemId);

  return evaluationItemQueue.add(evalItemId, data, {
    deduplication: {
      id: evalItemId,
      ttl: 5000
    },
    ...options
  });
};

export const addEvaluationItemJobs = (
  jobs: Array<{
    data: EvaluationItemJobData;
    delay?: number;
  }>
) => {
  const bulkJobs = jobs.map(({ data, delay }, index) => {
    const evalItemId = String(data.evalItemId);
    return {
      name: evalItemId,
      data,
      opts: {
        delay: delay ?? index * 100, // Small delay to avoid overwhelming system
        deduplication: { id: evalItemId }
      }
    };
  });

  return evaluationItemQueue.addBulk(bulkJobs);
};

export const checkEvaluationTaskJobActive = async (evalId: string): Promise<boolean> => {
  try {
    // Check active jobs first (most likely state for active tasks)
    const activeJobs = await evaluationTaskQueue.getJobs([
      'active',
      'waiting',
      'delayed',
      'prioritized'
    ]);
    const job = activeJobs.find((j) => j.data.evalId === evalId);

    return job !== undefined;
  } catch (error) {
    addLog.error('[Evaluation] Failed to check task job status', { evalId, error });
    return false;
  }
};

export const checkEvaluationItemJobActive = async (evalItemId: string): Promise<boolean> => {
  try {
    // Check active jobs first (most likely state for active items)
    const activeJobs = await evaluationItemQueue.getJobs([
      'active',
      'waiting',
      'delayed',
      'prioritized'
    ]);
    const job = activeJobs.find((j) => j.data.evalItemId === evalItemId);

    return job !== undefined;
  } catch (error) {
    addLog.error('[Evaluation] Failed to check item job status', { evalItemId, error });
    return false;
  }
};
