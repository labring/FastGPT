import crypto from 'crypto';
import { getQueue, getWorker, QueueNames } from '../../../../common/bullmq';
import { collectionDeleteProcessor } from './processor';

export type CollectionDeleteJobData = {
  teamId: string;
  collectionIds: string[];
};

// 创建工作进程
export const initCollectionDeleteWorker = () => {
  return getWorker<CollectionDeleteJobData>(
    QueueNames.collectionDelete,
    collectionDeleteProcessor,
    {
      concurrency: 1, // 确保同时只有1个删除任务
      removeOnFail: {
        age: 90 * 24 * 60 * 60, // 保留90天失败记录
        count: 10000 // 最多保留10000个失败任务
      }
    }
  );
};

// 添加删除任务
export const addCollectionDeleteJob = (data: CollectionDeleteJobData) => {
  const collectionDeleteQueue = getQueue<CollectionDeleteJobData>(QueueNames.collectionDelete, {
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

  // 使用 teamId + 所有 collectionIds 的 hash 作为 jobId 去重，避免重复入队
  const idsHash = crypto
    .createHash('md5')
    .update(data.collectionIds.slice().sort().join(','))
    .digest('hex');
  const jobId = `${String(data.teamId)}-${idsHash}`;

  return collectionDeleteQueue.add('delete_collection', data, {
    jobId,
    delay: 1000 // 延迟1秒执行，确保API响应完成
  });
};
