import { getQueue, getWorker, QueueNames } from '../../../common/bullmq';
import { datasetDeleteProcessor } from './processor';

export type DatasetDeleteJobData = {
  teamId: string;
  datasetId: string;
};

// 创建工作进程
export const initDatasetDeleteWorker = () => {
  return getWorker<DatasetDeleteJobData>(QueueNames.datasetDelete, datasetDeleteProcessor, {
    concurrency: 1, // 确保同时只有1个删除任务
    removeOnFail: {
      age: 30 * 24 * 60 * 60 // 保留30天失败记录
    }
  });
};

// 添加删除任务
export const addDatasetDeleteJob = (data: DatasetDeleteJobData) => {
  // 创建删除队列
  const datasetDeleteQueue = getQueue<DatasetDeleteJobData>(QueueNames.datasetDelete, {
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

  const jobId = `${String(data.teamId)}:${String(data.datasetId)}`;

  // 使用去重机制，避免重复删除
  return datasetDeleteQueue.add('delete_dataset', data, {
    jobId,
    delay: 1000 // 延迟1秒执行，确保API响应完成
  });
};
