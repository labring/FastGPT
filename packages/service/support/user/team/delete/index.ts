import { getQueue, getWorker, QueueNames } from '../../../../common/bullmq';
import { teamDeleteProcessor } from './processor';

export type TeamDeleteJobData = {
  teamId: string;
};

// 创建工作进程
export const initTeamDeleteWorker = () => {
  return getWorker<TeamDeleteJobData>(QueueNames.teamDelete, teamDeleteProcessor, {
    concurrency: 1, // 确保同时只有1个删除任务
    removeOnFail: {
      age: 90 * 24 * 60 * 60, // 保留90天失败记录
      count: 10000 // 最多保留10000个失败任务
    }
  });
};

// 添加删除任务
export const addTeamDeleteJob = (data: TeamDeleteJobData) => {
  // 创建删除队列
  const teamDeleteQueue = getQueue<TeamDeleteJobData>(QueueNames.teamDelete, {
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

  const jobId = `${String(data.teamId)}`;

  // Use jobId to automatically prevent duplicate deletion tasks (BullMQ feature)
  return teamDeleteQueue.add('delete_team', data, {
    jobId,
    delay: 1000 // Delay 1 second to ensure API response completes
  });
};
