import { NextAPI } from '@/service/middleware/entry';
import {
  WritePermissionVal,
  PerResourceTypeEnum,
  OwnerRoleVal
} from '@fastgpt/global/support/permission/constant';
import { TeamSkillCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { authSkill } from '@fastgpt/service/support/permission/skill/auth';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { Types } from '@fastgpt/service/common/mongo';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { createSkill, updateCurrentVersion } from '@fastgpt/service/core/ai/skill/manage';
import { copySkillPackage, removeSkillPackageTTL } from '@fastgpt/service/core/ai/skill/package';
import { createVersion } from '@fastgpt/service/core/ai/skill/version';
import { MongoAgentSkillsVersion } from '@fastgpt/service/core/ai/skill/version/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { addAuditLog, getI18nSkillType } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { copyAvatarImage } from '@fastgpt/service/common/file/image/controller';
import { getS3AvatarSource } from '@fastgpt/service/common/s3/sources/avatar';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import {
  CopySkillBodySchema,
  type CopySkillBody,
  type CopySkillResponse
} from '@fastgpt/global/openapi/core/ai/skill/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';

async function handler(req: ApiRequestProps<CopySkillBody>): Promise<CopySkillResponse> {
  const { skillId } = parseApiInput({ req, bodySchema: CopySkillBodySchema }).body;

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

  if (!skill.currentVersionId) {
    return Promise.reject(SkillErrEnum.noStorage);
  }

  const sourceVersion = await MongoAgentSkillsVersion.findOne({
    _id: skill.currentVersionId,
    skillId
  }).lean();
  if (!sourceVersion?.storageKey) {
    return Promise.reject(SkillErrEnum.noStorage);
  }

  const preassignedSkillId = new Types.ObjectId().toString();
  const versionId = new Types.ObjectId().toString();

  // Copy the ZIP package before opening the Mongo transaction. If the transaction fails, the
  // temporary S3 TTL remains and the shared S3 cleanup flow removes the orphan package.
  const storageInfo = await copySkillPackage(sourceVersion.storageKey, {
    teamId,
    skillId: preassignedSkillId,
    packageObjectId: versionId
  });

  // 4. Transaction: copy avatar → create skill record → create version → write owner record
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
        skillId: preassignedSkillId,
        parentId: skill.parentId ?? null,
        name: copyName,
        description: skill.description,
        category: skill.category,
        avatar,
        teamId,
        tmbId
      },
      session
    );

    // Point the copied skill to the copied package version.
    await updateCurrentVersion(newId, versionId, session);

    // Create the initial v0 version record
    await createVersion(
      {
        versionId,
        skillId: newId,
        tmbId,
        versionName: 'Copied from ' + skill.name,
        storageKey: storageInfo.key
      },
      session
    );
    await removeSkillPackageTTL(storageInfo.key, session);

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
