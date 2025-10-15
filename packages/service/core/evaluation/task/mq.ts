import { addLog } from '../../../common/system/log';
import { getQueue, getWorker, QueueNames } from '../../../common/bullmq';
import { UnrecoverableError } from 'bullmq';
import type { EvaluationItemJobData } from '@fastgpt/global/core/evaluation/type';
import { EvaluationStatusEnum } from '@fastgpt/global/core/evaluation/constants';
import {
  createJobCleaner,
  type JobCleanupResult,
  type JobCleanupOptions,
  checkBullMQHealth
} from '../utils/mq';
import { getErrText } from '@fastgpt/global/common/error/utils';

export const evaluationItemQueue = getQueue<EvaluationItemJobData>(QueueNames.evalTaskItem, {
  defaultJobOptions: {
    attempts: global.systemEnv?.evalConfig?.caseMaxRetry || 3,
    backoff: {
      type: 'exponential',
      delay: 1000 // Initial delay 1s, exponential backoff
    },
    removeOnComplete: true,
    removeOnFail: false
  }
});

export const getEvaluationItemWorker = (processor: any) => {
  const worker = getWorker<EvaluationItemJobData>(QueueNames.evalTaskItem, processor, {
    concurrency: global.systemEnv?.evalConfig?.caseConcurrency || 10,
    stalledInterval: 30000, // 30 seconds for faster recovery
    maxStalledCount: global.systemEnv?.evalConfig?.maxStalledCount || 3
  });
  worker.on('stalled', async (jobId) => {
    try {
      const job = await evaluationItemQueue.getJob(jobId);
      const evalItemId = job?.data?.evalItemId;

      addLog.warn('[Evaluation] Item job stalled, will be retried', {
        jobId,
        evalId: job?.data?.evalId,
        evalItemId,
        attemptsMade: job?.attemptsMade,
        opts: job?.opts?.attempts
      });

      // Update status to queuing since stalled jobs will be retried
      if (evalItemId) {
        const { MongoEvalItem } = await import('./schema');
        await MongoEvalItem.updateOne(
          { _id: evalItemId },
          {
            $set: {
              status: EvaluationStatusEnum.queuing
            },
            $unset: {
              finishTime: 1,
              errorMessage: 1
            }
          }
        );
      }
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
      // Get max attempts from queue's defaultJobOptions or fallback to global config
      const queueDefaultAttempts = evaluationItemQueue.opts?.defaultJobOptions?.attempts;
      const maxAttempts = job?.opts?.attempts || queueDefaultAttempts || 0;
      const attemptsMade = job?.attemptsMade || 0;

      // Check if error is UnrecoverableError (which prevents retries regardless of attempts)
      const isUnrecoverableError = error instanceof UnrecoverableError;

      // Job will retry only if:
      // 1. Not an UnrecoverableError AND
      // 2. Still has attempts remaining
      const willRetry = !isUnrecoverableError && attemptsMade < maxAttempts;

      addLog.error('[Evaluation] Item job failed', {
        jobId: job?.id,
        evalId,
        evalItemId,
        attemptsMade,
        maxAttempts,
        isUnrecoverableError,
        willRetry,
        error
      });

      // Update item status based on whether it will retry
      if (evalItemId) {
        const { MongoEvalItem } = await import('./schema');

        if (willRetry) {
          // Job will be retried, set status to queuing and clear error state
          await MongoEvalItem.updateOne(
            { _id: evalItemId },
            {
              $set: {
                status: EvaluationStatusEnum.queuing
              },
              $unset: {
                finishTime: 1,
                errorMessage: 1
              }
            }
          );
        } else {
          // Job exhausted all retries, set final error status
          await MongoEvalItem.updateOne(
            { _id: evalItemId },
            {
              $set: {
                errorMessage: getErrText(error),
                finishTime: new Date(),
                status: EvaluationStatusEnum.error
              }
            }
          );
        }
      }

      // Check task completion after failure (only if no more retries)
      if (evalId && !willRetry) {
        addLog.debug('[Evaluation] Checking task completion after final item failure', {
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
              status: EvaluationStatusEnum.evaluating
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
              status: EvaluationStatusEnum.completed,
              finishTime: new Date()
            },
            $unset: {
              errorMessage: 1
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

export const checkEvaluationItemQueueHealth = (): Promise<void> => {
  return checkBullMQHealth(evaluationItemQueue, 'evaluation-item');
};
