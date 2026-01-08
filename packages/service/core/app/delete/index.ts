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

  const jobId = `${String(data.teamId)}:${String(data.appId)}`;

  // Use jobId to automatically prevent duplicate deletion tasks (BullMQ feature)
  return appDeleteQueue.add('delete_app', data, {
    jobId,
    delay: 1000 // Delay 1 second to ensure API response completes
  });
};
