import { addLog } from '../../../common/system/log';
import { getQueue, getWorker, QueueNames } from '../../../common/bullmq';
import type {
  EvaluationTaskJobData,
  EvaluationItemJobData
} from '@fastgpt/global/core/evaluation/type';
import {
  createJobCleaner,
  type JobCleanupResult,
  type JobCleanupOptions
} from '../utils/jobCleanup';

export const evaluationTaskQueue = getQueue<EvaluationTaskJobData>(QueueNames.evalTask, {
  defaultJobOptions: {
    attempts: 1, // The task queue does not retry, and errors are handled internally
    removeOnComplete: 100,
    removeOnFail: 100
  }
});

export const evaluationItemQueue = getQueue<EvaluationItemJobData>(QueueNames.evalTaskItem, {
  defaultJobOptions: {
    attempts: 1, // Disable BullMQ retry, use manual retry mechanism instead
    removeOnComplete: 500,
    removeOnFail: 500
  }
});

export const getEvaluationTaskWorker = (processor: any) =>
  getWorker<EvaluationTaskJobData>(QueueNames.evalTask, processor, {
    concurrency: Number(process.env.EVAL_TASK_CONCURRENCY) || 3
  });

export const getEvaluationItemWorker = (processor: any) =>
  getWorker<EvaluationItemJobData>(QueueNames.evalTaskItem, processor, {
    concurrency: Number(process.env.EVAL_ITEM_CONCURRENCY) || 10
  });

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

export const getEvaluationQueueStats = async () => {
  const [taskStats, itemStats] = await Promise.all([
    evaluationTaskQueue.getJobCounts('active', 'prioritized', 'waiting', 'completed', 'failed'),
    evaluationItemQueue.getJobCounts('active', 'prioritized', 'waiting', 'completed', 'failed')
  ]);

  return {
    taskQueue: taskStats,
    itemQueue: itemStats
  };
};
