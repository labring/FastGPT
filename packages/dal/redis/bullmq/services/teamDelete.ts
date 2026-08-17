import { bullMQ, type BullMQBinding } from '../binding';
import { addOrRequeueFailedJob } from '../job-recovery';
import { QueueNames } from '../names';
import type { Processor, Queue, Worker } from '../types';

export type TeamDeleteJobData = {
  teamId: string;
};

const teamDeleteQueueOptions = {
  defaultJobOptions: {
    attempts: 10,
    backoff: {
      type: 'exponential' as const,
      delay: 5000
    },
    removeOnComplete: true,
    removeOnFail: { age: 30 * 24 * 60 * 60 }
  }
};

/** Team 删除队列的业务合同和生命周期入口。 */
export class TeamDeleteMQService {
  constructor(private readonly binding: BullMQBinding = bullMQ) {}

  /** 获取 Team 删除队列；队列对象由 binding 按名称懒加载并复用。 */
  getQueue(): Queue<TeamDeleteJobData> {
    return this.binding.getQueue<TeamDeleteJobData>(QueueNames.teamDelete, teamDeleteQueueOptions);
  }

  /** 使用 service 统一的删除任务保留策略创建 Team 删除 Worker。 */
  getWorker(processor: Processor<TeamDeleteJobData>): Worker<TeamDeleteJobData> {
    return this.binding.getWorker<TeamDeleteJobData>(QueueNames.teamDelete, processor, {
      concurrency: 1,
      removeOnFail: {
        age: 90 * 24 * 60 * 60,
        count: 10000
      }
    });
  }

  /** 投递幂等的 Team 删除任务，并延迟一秒让请求先完成。 */
  addJob(data: TeamDeleteJobData) {
    return addOrRequeueFailedJob({
      queue: this.getQueue(),
      name: 'delete_team',
      data,
      opts: {
        jobId: String(data.teamId),
        delay: 1000
      }
    });
  }
}

export const teamDeleteMQService = new TeamDeleteMQService();
