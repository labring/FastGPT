import { appDeleteProcessor } from './processor';
import { appDeleteMQService, type AppDeleteJobData } from '@fastgpt/dal/redis/bullmq';

export type { AppDeleteJobData } from '@fastgpt/dal/redis/bullmq';

// 创建工作进程
export const initAppDeleteWorker = () => {
  return appDeleteMQService.getWorker(appDeleteProcessor);
};

// 添加删除任务
export const addAppDeleteJob = (data: AppDeleteJobData) => appDeleteMQService.addJob(data);
