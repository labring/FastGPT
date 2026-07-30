import { datasetDeleteProcessor } from './processor';
import { datasetDeleteMQService, type DatasetDeleteJobData } from '@fastgpt/dal/redis/bullmq';

export type { DatasetDeleteJobData } from '@fastgpt/dal/redis/bullmq';

// 创建工作进程
export const initDatasetDeleteWorker = () => {
  return datasetDeleteMQService.getWorker(datasetDeleteProcessor);
};

// 添加删除任务
export const addDatasetDeleteJob = (data: DatasetDeleteJobData) =>
  datasetDeleteMQService.addJob(data);
