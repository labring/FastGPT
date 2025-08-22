import { getQueue, getWorker, QueueNames } from '../../../common/bullmq';
import type {
  EvaluationTaskJobData,
  EvaluationItemJobData
} from '@fastgpt/global/core/evaluation/type';

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

export const removeEvaluationTaskJob = async (evalId: string) => {
  try {
    const jobs = await evaluationTaskQueue.getJobs(['prioritized', 'waiting', 'delayed']);
    const targetJobs = jobs.filter((job) => job.data.evalId === evalId);

    await Promise.all(targetJobs.map((job) => job.remove()));
  } catch (error) {
    console.error('Failed to remove evaluation task jobs:', error);
  }
};

export const removeEvaluationItemJobs = async (evalId: string) => {
  try {
    const jobs = await evaluationItemQueue.getJobs(['prioritized', 'waiting', 'delayed']);
    const targetJobs = jobs.filter((job) => job.data.evalId === evalId);

    await Promise.all(targetJobs.map((job) => job.remove()));
  } catch (error) {
    console.error('Failed to remove evaluation item jobs:', error);
  }
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
