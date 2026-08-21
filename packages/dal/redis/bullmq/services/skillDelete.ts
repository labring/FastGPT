import { bullMQ, type BullMQBinding } from '../binding';
import { QueueNames } from '../names';
import type { Processor, Queue, Worker } from '../types';

export type AgentSkillDeleteJobData = {
  teamId: string;
  skillId: string;
};

const agentSkillDeleteQueueOptions = {
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

/** Skill 删除队列的业务合同和生命周期入口。 */
export class SkillDeleteMQService {
  constructor(private readonly binding: BullMQBinding = bullMQ) {}

  /** 获取 Skill 删除队列；队列对象由 binding 按名称懒加载并复用。 */
  getQueue(): Queue<AgentSkillDeleteJobData> {
    return this.binding.getQueue<AgentSkillDeleteJobData>(
      QueueNames.agentSkillDelete,
      agentSkillDeleteQueueOptions
    );
  }

  /** 创建 Skill 删除 Worker；具体清理由调用方注入 processor。 */
  getWorker(processor: Processor<AgentSkillDeleteJobData>): Worker<AgentSkillDeleteJobData> {
    return this.binding.getWorker<AgentSkillDeleteJobData>(QueueNames.agentSkillDelete, processor, {
      concurrency: 1,
      removeOnFail: {
        age: 90 * 24 * 60 * 60,
        count: 10000
      }
    });
  }

  /** 投递以 teamId-skillId 去重的 Skill 删除任务。 */
  addJob(data: AgentSkillDeleteJobData) {
    const jobId = `${String(data.teamId)}-${String(data.skillId)}`;
    return this.getQueue().add('delete_agent_skill', data, {
      jobId,
      delay: 1000
    });
  }
}

export const skillDeleteMQService = new SkillDeleteMQService();
