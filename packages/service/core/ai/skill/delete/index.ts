import { getQueue, getWorker, QueueNames } from '../../../../common/bullmq';
import { agentSkillDeleteProcessor } from './processor';

export type AgentSkillDeleteJobData = {
  teamId: string;
  skillId: string;
};

/**
 * 初始化 Skill 删除 worker。
 *
 * 删除任务涉及对象存储、权限、版本和沙箱清理，单并发可以避免同一目录树重复清理时互相踩状态。
 */
export const initAgentSkillDeleteWorker = () => {
  return getWorker<AgentSkillDeleteJobData>(
    QueueNames.agentSkillDelete,
    agentSkillDeleteProcessor,
    {
      concurrency: 1,
      removeOnFail: {
        age: 90 * 24 * 60 * 60,
        count: 10000
      }
    }
  );
};

/**
 * 投递 Skill 删除任务。
 *
 * 使用 teamId-skillId 作为 jobId，让重复删除请求自然合并到同一个后台清理任务。
 */
export const addAgentSkillDeleteJob = (data: AgentSkillDeleteJobData) => {
  const agentSkillDeleteQueue = getQueue<AgentSkillDeleteJobData>(QueueNames.agentSkillDelete, {
    defaultJobOptions: {
      attempts: 10,
      backoff: {
        type: 'exponential',
        delay: 5000
      },
      removeOnComplete: true,
      removeOnFail: { age: 30 * 24 * 60 * 60 }
    }
  });

  const jobId = `${String(data.teamId)}-${String(data.skillId)}`;

  return agentSkillDeleteQueue.add('delete_agent_skill', data, {
    jobId,
    delay: 1000
  });
};
