import { bullMQ, type BullMQBinding } from '../binding';
import { QueueNames } from '../names';
import type { Processor, Queue, Worker } from '../types';

export type AgentSkillCreateJobData = {
  skillId: string;
  teamId: string;
  tmbId: string;
};

/** Skill 创建队列和幂等任务操作的业务服务。 */
export class SkillCreateMQService {
  constructor(private readonly binding: BullMQBinding = bullMQ) {}

  /** Skill 创建任务的默认队列配置；只在首次调用时创建 Queue。 */
  getQueue(): Queue<AgentSkillCreateJobData> {
    return this.binding.getQueue<AgentSkillCreateJobData>(QueueNames.agentSkillCreate, {
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: {
          age: 30 * 24 * 60 * 60,
          count: 1000
        }
      }
    });
  }

  /** 创建 Skill 创建 Worker；workspace、Mongo 和对象存储逻辑由 processor 所属领域维护。 */
  getWorker(processor: Processor<AgentSkillCreateJobData>): Worker<AgentSkillCreateJobData> {
    return this.binding.getWorker<AgentSkillCreateJobData>(QueueNames.agentSkillCreate, processor, {
      concurrency: 2
    });
  }

  /** 投递以 skillId 去重的 Skill 创建任务，并清理已经完成的旧任务。 */
  async addJob(data: AgentSkillCreateJobData) {
    const skillId = String(data.skillId);
    const queue = this.getQueue();
    const existingJob = await queue.getJob(skillId);
    if (existingJob) {
      const state = await existingJob.getState();
      if (state !== 'completed' && state !== 'failed') {
        return existingJob;
      }
      await existingJob.remove();
    }

    return queue.add(skillId, data, {
      jobId: skillId
    });
  }
}

export const skillCreateMQService = new SkillCreateMQService();
