import { getQueue, getWorker, QueueNames } from '../../../common/bullmq';
import { appDeleteProcessor } from './processor';

export type AppDeleteJobData = {
  teamId: string;
  appId: string;
};

// 创建工作进程
export const initAppDeleteWorker = () => {
  return getWorker<AppDeleteJobData>(QueueNames.appDelete, appDeleteProcessor, {
    concurrency: 1, // 确保同时只有1个删除任务
    removeOnFail: {
      age: 30 * 24 * 60 * 60 // 保留30天失败记录
    }
  });
};

// 添加删除任务
export const addAppDeleteJob = (data: AppDeleteJobData) => {
  // 创建删除队列
  const appDeleteQueue = getQueue<AppDeleteJobData>(QueueNames.appDelete, {
    defaultJobOptions: {
      attempts: 10,
      backoff: {
        type: 'exponential',
        delay: 5000
      },
      removeOnComplete: true,
      removeOnFail: { age: 30 * 24 * 60 * 60 } // 保留30天失败记录
    }
  });

  const jobId = `deleteapp:${data.teamId}:${data.appId}`;

  // 使用去重机制，避免重复删除
  return appDeleteQueue.add(jobId, data, {
    deduplication: { id: jobId },
    delay: 1000 // 延迟1秒执行，确保API响应完成
  });
};
