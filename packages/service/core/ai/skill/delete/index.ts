import { getQueue, getWorker, QueueNames } from '../../../../common/bullmq';
import { agentSkillDeleteProcessor } from './processor';
import { MongoAgentSkills } from '../model/schema';
import { getLogger, LogCategories } from '../../../../common/logger';
import { AgentSkillSourceEnum } from '@fastgpt/global/core/ai/skill/constants';

const logger = getLogger(LogCategories.MODULE.AGENT_SKILLS.CREATION);

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
  const worker = getWorker<AgentSkillDeleteJobData>(
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

  resumeMarkedSkillDeleteJobs().catch((error) => {
    logger.error('Failed to resume marked skill delete jobs', { error });
  });

  return worker;
};

/**
 * worker 启动时补偿已经软删但未入队/未完成的 Skill 删除任务。
 *
 * 删除 API 是“先提交 Mongo 软删，再投递 BullMQ”。如果进程在两步之间退出，
 * 这里会把 deleteTime 不为空的删除子树根节点重新投递，避免不可见数据长期残留。
 */
export async function resumeMarkedSkillDeleteJobs(): Promise<void> {
  const markedSkills = await MongoAgentSkills.find(
    {
      source: AgentSkillSourceEnum.personal,
      deleteTime: { $exists: true, $ne: null },
      teamId: { $exists: true, $ne: null }
    },
    {
      _id: 1,
      teamId: 1,
      parentId: 1
    }
  ).lean();

  if (markedSkills.length === 0) return;

  const markedIds = new Set(markedSkills.map((skill) => String(skill._id)));
  const rootMarkedSkills = markedSkills.filter((skill) => {
    const parentId = skill.parentId ? String(skill.parentId) : '';
    return !parentId || !markedIds.has(parentId);
  });

  const results = await Promise.allSettled(
    rootMarkedSkills.map((skill) =>
      addAgentSkillDeleteJob({
        teamId: String(skill.teamId),
        skillId: String(skill._id)
      })
    )
  );

  const failedCount = results.filter((result) => result.status === 'rejected').length;
  logger.info('Marked skill delete jobs resumed', {
    totalMarked: markedSkills.length,
    rootCount: rootMarkedSkills.length,
    failedCount
  });
}

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
