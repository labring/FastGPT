import { AgentSkillSourceEnum, AgentSkillTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import type { AgentSkillSchemaType } from '@fastgpt/global/core/ai/skill/type';
import type { ClientSession } from '../../../../common/mongo';
import { removeImageByPath } from '../../../../common/file/image/controller';
import { getLogger, LogCategories } from '../../../../common/logger';
import { deleteSkillAllPackages } from '../package';
import { MongoAgentSkills } from '../model/schema';
import { MongoAgentSkillsVersion } from '../version/schema';
import { deleteSkillRelatedSandboxes } from '../sandbox/controller';
import { findSkillAndAllChildren } from './folder';

const logger = getLogger(LogCategories.MODULE.AGENT_SKILLS.CREATION);

/**
 * Soft delete a skill or folder.
 *
 * Folder deletion recursively soft-deletes children and their version records.
 * Package and sandbox cleanup is deliberately best-effort because object
 * storage/provider resources are outside the Mongo transaction.
 */
export async function deleteSkill(skillId: string, session?: ClientSession): Promise<void> {
  const skill = await MongoAgentSkills.findOne({
    _id: skillId,
    deleteTime: null
  });

  if (!skill) {
    throw new Error('Skill not found');
  }

  if (skill.source === AgentSkillSourceEnum.system) {
    throw new Error('Cannot delete system skill');
  }

  let deleteList: AgentSkillSchemaType[];
  if (skill.type === AgentSkillTypeEnum.folder) {
    deleteList = await findSkillAndAllChildren({
      teamId: skill.teamId!.toString(),
      skillId
    });
  } else {
    deleteList = [skill];
  }

  await MongoAgentSkills.updateMany(
    { _id: { $in: deleteList.map((s) => s._id) } },
    { $set: { deleteTime: new Date() } },
    { session }
  );

  await MongoAgentSkillsVersion.updateMany(
    { skillId: { $in: deleteList.map((s) => s._id) } },
    { $set: { isDeleted: true } },
    { session }
  );

  for (const item of deleteList) {
    if (item.teamId && item.type !== AgentSkillTypeEnum.folder) {
      deleteSkillAllPackages(item.teamId.toString(), item._id);
      if (item.avatar) {
        removeImageByPath(item.avatar);
      }
    }
  }

  const nonFolderIds = deleteList
    .filter((s) => s.type !== AgentSkillTypeEnum.folder)
    .map((s) => s._id.toString());
  if (nonFolderIds.length > 0) {
    deleteSkillRelatedSandboxes(nonFolderIds).catch((err) => {
      logger.error('[Skill] Failed to cleanup skill sandboxes', {
        skillIds: nonFolderIds,
        error: err
      });
    });
  }
}
