import { NextAPI } from '@/service/middleware/entry';
import { authSkill } from '@fastgpt/service/support/permission/agentSkill/auth';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import {
  updateSkill,
  checkSkillNameExists,
  updateParentFoldersUpdateTime
} from '@fastgpt/service/core/agentSkills/controller';
import { MongoAgentSkills } from '@fastgpt/service/core/agentSkills/schema';
import {
  ManagePermissionVal,
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { TeamSkillCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { parseParentIdInMongo } from '@fastgpt/global/common/parentFolder/utils';
import {
  AgentSkillTypeEnum,
  AgentSkillCategoryEnum
} from '@fastgpt/global/core/agentSkills/constants';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/agentSkill';
import {
  syncChildrenPermission,
  syncCollaborators
} from '@fastgpt/service/support/permission/inheritPermission';
import { getResourceOwnedClbs } from '@fastgpt/service/support/permission/controller';
import type { UpdateSkillBody } from '@fastgpt/global/core/agentSkills/api';
import { addAuditLog, getI18nSkillType } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { isValidObjectId } from 'mongoose';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { getS3AvatarSource } from '@fastgpt/service/common/s3/sources/avatar';

async function handler(req: ApiRequestProps<UpdateSkillBody>) {
  const { skillId, name, description, category, config, avatar, parentId } =
    req.body as UpdateSkillBody;

  if (!skillId) {
    return Promise.reject(SkillErrEnum.invalidSkillId);
  }

  if (!isValidObjectId(skillId)) {
    return Promise.reject(SkillErrEnum.invalidSkillId);
  }

  const isMove = parentId !== undefined;

  // Fetch skill with basic read permission; finer-grained checks follow based on operation type
  const { teamId, tmbId, skill, permission } = await authSkill({
    req,
    skillId,
    per: ReadPermissionVal,
    authToken: true,
    authApiKey: true
  });

  if (isMove) {
    // Move operation: check source folder, target folder, and root-level permissions
    if (parentId) {
      // Moving into a target folder: require manage permission on the destination folder
      await authSkill({
        req,
        skillId: parentId,
        per: ManagePermissionVal,
        authToken: true,
        authApiKey: true
      });
    }

    if (skill.parentId) {
      // Moving out of the source folder: require manage permission on the source folder
      await authSkill({
        req,
        skillId: String(skill.parentId),
        per: ManagePermissionVal,
        authToken: true,
        authApiKey: true
      });
    }

    if (parentId === null || !skill.parentId) {
      // Involves root directory (moving into or out of root): require team-level skill create permission
      await authUserPer({
        req,
        authToken: true,
        authApiKey: true,
        per: TeamSkillCreatePermissionVal
      });
    }
  } else {
    // Non-move operation: require write permission
    if (!permission.hasWritePer) {
      return Promise.reject(SkillErrEnum.unAuthSkill);
    }
  }

  if (!isMove) {
    // Field validation for normal update
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return Promise.reject(SkillErrEnum.invalidSkillName);
      }
      if (name.length > 50) {
        return Promise.reject(SkillErrEnum.invalidSkillName);
      }
      const nameExists = await checkSkillNameExists(
        name.trim(),
        teamId,
        skill.parentId ?? null,
        skillId
      );
      if (nameExists) {
        return Promise.reject(SkillErrEnum.skillNameExists);
      }
    }

    if (description !== undefined && description.length > 500) {
      return Promise.reject(SkillErrEnum.invalidDescription);
    }

    if (category !== undefined) {
      const validCategories = Object.values(AgentSkillCategoryEnum) as string[];
      if (category.some((c) => !validCategories.includes(c))) {
        return Promise.reject(SkillErrEnum.invalidCategory);
      }
    }

    if (config !== undefined && JSON.stringify(config).length > 50_000) {
      return Promise.reject(SkillErrEnum.invalidConfig);
    }

    const updateData: Record<string, any> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description.trim();
    if (category !== undefined) updateData.category = category;
    if (config !== undefined) updateData.config = config;
    if (avatar !== undefined) updateData.avatar = avatar;

    if (Object.keys(updateData).length === 0) {
      return Promise.reject(SkillErrEnum.noFieldsToUpdate);
    }

    await mongoSessionRun(async (session) => {
      await updateSkill(skillId, updateData, session);
      await getS3AvatarSource().refreshAvatar(avatar, skill.avatar, session);
    });

    updateParentFoldersUpdateTime({ parentId: skill.parentId ?? null });

    (async () => {
      addAuditLog({
        tmbId,
        teamId,
        event: AuditEventEnum.UPDATE_SKILL,
        params: { skillName: skill.name, skillType: getI18nSkillType(skill.type) }
      });
    })();
  } else {
    // Move operation: sync permissions and update parentId
    let targetFolderName = 'root';
    if (parentId) {
      const targetFolder = await MongoAgentSkills.findById(parentId, 'name').lean();
      if (targetFolder) targetFolderName = targetFolder.name;
    }

    await mongoSessionRun(async (session) => {
      // Fetch collaborators of the target folder (null = root has no collaborators)
      const parentClbs = await getResourceOwnedClbs({
        teamId,
        resourceId: parentId,
        resourceType: PerResourceTypeEnum.agentSkill,
        session
      });

      // Sync permission records for the skill itself
      await syncCollaborators({
        resourceId: skillId,
        resourceType: PerResourceTypeEnum.agentSkill,
        collaborators: parentClbs,
        session,
        teamId
      });

      // Sync subtree permissions (only effective when the skill is a folder)
      await syncChildrenPermission({
        resource: skill,
        resourceType: PerResourceTypeEnum.agentSkill,
        resourceModel: MongoAgentSkills,
        folderTypeList: [AgentSkillTypeEnum.folder],
        collaborators: parentClbs,
        session
      });

      // Update parentId and mark permission as inherited
      await MongoAgentSkills.findByIdAndUpdate(
        skillId,
        {
          ...parseParentIdInMongo(parentId),
          inheritPermission: true,
          updateTime: new Date()
        },
        { session }
      );
    });

    // Update updateTime on both old and new parent folders
    updateParentFoldersUpdateTime({ parentId: skill.parentId ?? null });
    updateParentFoldersUpdateTime({ parentId });

    (async () => {
      addAuditLog({
        tmbId,
        teamId,
        event: AuditEventEnum.MOVE_SKILL,
        params: { skillName: skill.name, skillType: getI18nSkillType(skill.type), targetFolderName }
      });
    })();
  }
}

export default NextAPI(handler);
