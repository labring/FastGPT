import { NextAPI } from '@/service/middleware/entry';
import {
  WritePermissionVal,
  PerResourceTypeEnum,
  OwnerRoleVal
} from '@fastgpt/global/support/permission/constant';
import { TeamSkillCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { authSkill } from '@fastgpt/service/support/permission/agentSkill/auth';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { createSkill, updateCurrentStorage } from '@fastgpt/service/core/agentSkills/controller';
import { copySkillPackage } from '@fastgpt/service/core/agentSkills/storage';
import { createVersion } from '@fastgpt/service/core/agentSkills/version/controller';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { addAuditLog, getI18nSkillType } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { copyAvatarImage } from '@fastgpt/service/common/file/image/controller';
import { getS3AvatarSource } from '@fastgpt/service/common/s3/sources/avatar';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import type { CopySkillBody, CopySkillResponse } from '@fastgpt/global/core/agentSkills/api';

async function handler(req: ApiRequestProps<CopySkillBody>): Promise<CopySkillResponse> {
  const { skillId } = req.body;

  // 1. Auth: require write permission on the source skill
  const { skill, teamId } = await authSkill({
    req,
    skillId,
    per: WritePermissionVal,
    authToken: true,
    authApiKey: true
  });

  // 2. Auth: require write permission on the parent folder, or team-level create permission for root
  const { tmbId } = skill.parentId
    ? await authSkill({
        req,
        skillId: String(skill.parentId),
        per: WritePermissionVal,
        authToken: true,
        authApiKey: true
      })
    : await authUserPer({
        req,
        authToken: true,
        authApiKey: true,
        per: TeamSkillCreatePermissionVal
      });

  // 3. Append " Copy" suffix to the name; duplicate conflicts are handled by E11000 (see app/copy.ts)
  const copyName = `${skill.name} Copy`;

  if (!skill.currentStorage) {
    return Promise.reject(new Error('Skill has no storage, cannot copy'));
  }

  // 4. Transaction: copy avatar → create skill record → copy MinIO package → create version → write owner record
  const newSkillId = await mongoSessionRun(async (session) => {
    // Copy avatar (handles S3 file / MongoDB image record / emoji safely)
    const avatar = await copyAvatarImage({
      teamId,
      imageUrl: skill.avatar ?? '',
      temporary: true,
      session
    });

    // Create the new skill record
    const newId = await createSkill(
      {
        parentId: skill.parentId ?? null,
        name: copyName,
        description: skill.description,
        author: String(skill.author || ''),
        category: skill.category,
        config: skill.config,
        avatar,
        teamId,
        tmbId
      },
      session
    );

    // Copy the ZIP package in MinIO to the new skill path
    const storageInfo = await copySkillPackage(skill.currentStorage!, {
      teamId,
      skillId: newId,
      version: 0
    });

    // Update currentStorage on the new skill
    await updateCurrentStorage(newId, storageInfo, session);

    // Create the initial v0 version record
    await createVersion(
      {
        skillId: newId,
        tmbId,
        version: 0,
        versionName: 'Copied from ' + skill.name,
        storage: storageInfo
      },
      session
    );

    // Write owner record to ResourcePermission
    await MongoResourcePermission.insertOne(
      {
        teamId,
        tmbId,
        resourceId: newId,
        permission: OwnerRoleVal,
        resourceType: PerResourceTypeEnum.agentSkill
      },
      { session }
    );

    // Promote temporary avatar to permanent (remove TTL)
    await getS3AvatarSource().refreshAvatar(avatar, undefined, session);

    return newId;
  });

  // 5. Audit log
  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.COPY_SKILL,
      params: { skillName: skill.name, skillType: getI18nSkillType(skill.type) }
    });
  })();

  return { skillId: newSkillId };
}

export default NextAPI(handler);
