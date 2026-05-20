import type { Processor } from 'bullmq';
import type { AgentSkillDeleteJobData } from './index';
import { batchRun } from '@fastgpt/global/common/system/utils';
import { AgentSkillTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import type { AgentSkillSchemaType } from '@fastgpt/global/core/ai/skill/type';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { removeImageByPath } from '../../../../common/file/image/controller';
import { getLogger, LogCategories } from '../../../../common/logger';
import { MongoResourcePermission } from '../../../../support/permission/schema';
import { mongoSessionRun } from '../../../../common/mongo/sessionRun';
import { deleteSkillAllPackages } from '../package';
import { MongoAgentSkills } from '../model/schema';
import { MongoAgentSkillsVersion } from '../version/schema';
import { deleteSkillRelatedSandboxes } from '../sandbox/controller';
import { findSkillAndAllChildren } from '../manage/folder';

const logger = getLogger(LogCategories.MODULE.AGENT_SKILLS.CREATION);

const deleteSkillExternalData = async ({
  teamId,
  skills
}: {
  teamId: string;
  skills: AgentSkillSchemaType[];
}) => {
  const nonFolderSkills = skills.filter((skill) => skill.type !== AgentSkillTypeEnum.folder);

  await batchRun(
    nonFolderSkills,
    async (skill) => {
      const skillId = String(skill._id);
      await deleteSkillAllPackages(teamId, skillId);
      await removeImageByPath(skill.avatar);
    },
    3
  );

  const nonFolderSkillIds = nonFolderSkills.map((skill) => String(skill._id));
  if (nonFolderSkillIds.length > 0) {
    await deleteSkillRelatedSandboxes(nonFolderSkillIds);
  }
};

/**
 * 真正执行 Skill 删除清理。
 *
 * API 只负责把 Mongo 主记录和版本记录标记为删除；这里再清理 S3、头像、沙箱、权限和硬删除
 * Mongo 记录。这样 Mongo 事务失败时不会提前删除外部资源，S3 失败时也可以由队列重试。
 */
export const agentSkillDeleteProcessor: Processor<AgentSkillDeleteJobData> = async (job) => {
  const { teamId, skillId } = job.data;
  const startTime = Date.now();

  logger.info('Agent skill delete started', { teamId, skillId });

  try {
    let skills: AgentSkillSchemaType[];
    try {
      skills = await findSkillAndAllChildren({
        teamId,
        skillId,
        includeDeleted: true
      });
    } catch (error) {
      logger.warn('Agent skill not found for deletion', { teamId, skillId, error });
      return;
    }

    if (skills.length === 0) {
      logger.warn('Agent skill not found for deletion', { teamId, skillId });
      return;
    }

    const skillIds = skills.map((skill) => String(skill._id));

    // 安全检查：后台任务只应该清理已经被 API 标记为 deleteTime 的记录。
    const markedForDelete = await MongoAgentSkills.find(
      {
        _id: { $in: skillIds },
        teamId,
        deleteTime: { $ne: null }
      },
      { _id: 1 }
    ).lean();

    if (markedForDelete.length !== skills.length) {
      logger.warn('Agent skill delete safety check mismatch', {
        teamId,
        skillId,
        markedCount: markedForDelete.length,
        totalCount: skills.length,
        markedSkillIds: markedForDelete.map((skill) => String(skill._id)),
        totalSkillIds: skillIds
      });
      throw new Error('Agent skill delete safety check mismatch');
    }

    await deleteSkillExternalData({ teamId, skills });

    await mongoSessionRun(async (session) => {
      await MongoAgentSkillsVersion.deleteMany({ skillId: { $in: skillIds } }, { session });

      await MongoResourcePermission.deleteMany(
        {
          teamId,
          resourceType: PerResourceTypeEnum.agentSkill,
          resourceId: { $in: skillIds }
        },
        { session }
      );

      await MongoAgentSkills.deleteMany(
        {
          _id: { $in: skillIds },
          teamId
        },
        { session }
      );
    });

    logger.info('Agent skill delete completed', {
      teamId,
      skillId,
      totalSkills: skillIds.length,
      skillIds,
      durationMs: Date.now() - startTime
    });
  } catch (error) {
    logger.error('Agent skill delete failed', { teamId, skillId, error });
    throw error;
  }
};
