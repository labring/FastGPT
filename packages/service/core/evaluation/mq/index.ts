import { getQueue, getWorker, QueueNames } from '../../../common/bullmq';
import type {
  EvaluationTaskJobData,
  EvaluationItemJobData
} from '@fastgpt/global/core/evaluation/type';

// 评估任务队列
export const evaluationTaskQueue = getQueue<EvaluationTaskJobData>(QueueNames.evaluation_task, {
  defaultJobOptions: {
    attempts: 1, // 任务队列不重试，错误由内部处理
    removeOnComplete: 100,
    removeOnFail: 100
  }
});

// 评估项队列
export const evaluationItemQueue = getQueue<EvaluationItemJobData>(QueueNames.evaluation_item, {
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000
    },
    removeOnComplete: 500,
    removeOnFail: 500
  }
});

// 获取评估任务 Worker
export const getEvaluationTaskWorker = (processor: any) =>
  getWorker<EvaluationTaskJobData>(QueueNames.evaluation_task, processor, {
    concurrency: Number(process.env.EVAL_TASK_CONCURRENCY) || 3
  });

// 获取评估项 Worker
export const getEvaluationItemWorker = (processor: any) =>
  getWorker<EvaluationItemJobData>(QueueNames.evaluation_item, processor, {
    concurrency: Number(process.env.EVAL_ITEM_CONCURRENCY) || 10
  });

// 移除评估任务队列中的作业
export const removeEvaluationTaskJob = async (evalId: string) => {
  try {
    const jobs = await evaluationTaskQueue.getJobs(['active', 'waiting', 'delayed']);
    const targetJobs = jobs.filter((job) => job.data.evalId === evalId);

    await Promise.all(targetJobs.map((job) => job.remove()));
  } catch (error) {
    console.error('Failed to remove evaluation task jobs:', error);
  }
};

// 移除评估项队列中的作业
export const removeEvaluationItemJobs = async (evalId: string) => {
  try {
    const jobs = await evaluationItemQueue.getJobs(['active', 'waiting', 'delayed']);
    const targetJobs = jobs.filter((job) => job.data.evalId === evalId);

    await Promise.all(targetJobs.map((job) => job.remove()));
  } catch (error) {
    console.error('Failed to remove evaluation item jobs:', error);
  }
};

// 获取队列统计信息
export const getEvaluationQueueStats = async () => {
  const [taskStats, itemStats] = await Promise.all([
    evaluationTaskQueue.getJobCounts('active', 'waiting', 'completed', 'failed'),
    evaluationItemQueue.getJobCounts('active', 'waiting', 'completed', 'failed')
  ]);

  return {
    taskQueue: taskStats,
    itemQueue: itemStats
  };
};
