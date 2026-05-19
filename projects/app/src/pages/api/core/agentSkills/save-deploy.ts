import { NextAPI } from '@/service/middleware/entry';
import { authSkill } from '@fastgpt/service/support/permission/agentSkill/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { updateCurrentStorage } from '@fastgpt/service/core/agentSkills/controller';
import { packageSkillInSandbox } from '@fastgpt/service/core/agentSkills/sandboxController';
import { EDIT_DEBUG_SANDBOX_CHAT_ID } from '@fastgpt/service/core/agentSkills/sandboxConfig';
import {
  createVersion,
  getNextVersionNumber,
  setActiveVersion
} from '@fastgpt/service/core/agentSkills/version/controller';
import { uploadSkillPackage } from '@fastgpt/service/core/agentSkills/storage';
import { extractSkillMdInfosFromBuffer } from '@fastgpt/service/core/agentSkills/archiveUtils';
import { extractSkillFromMarkdown } from '@fastgpt/service/core/agentSkills/utils';
import { findSandboxInstanceByAppChatType } from '@fastgpt/service/core/ai/sandbox/instance';
import { getSandboxProviderConfig } from '@fastgpt/service/core/ai/sandbox/config';
import { MongoAgentSkills } from '@fastgpt/service/core/agentSkills/schema';
import { SandboxTypeEnum } from '@fastgpt/global/core/agentSkills/constants';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import {
  SaveDeploySkillBodySchema,
  SaveDeploySkillResponseSchema,
  type SaveDeploySkillBody,
  type SaveDeploySkillResponse
} from '@fastgpt/global/core/agentSkills/api';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { addAuditLog, getI18nSkillType } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { isValidObjectId } from 'mongoose';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/agentSkill';
import { UserError } from '@fastgpt/global/common/error/utils';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';

const logger = getLogger(LogCategories.MODULE.AGENT_SKILLS.DEPLOY);

/**
 * Package and deploy a skill from sandbox, creating a new version.
 */
async function handler(
  req: ApiRequestProps<SaveDeploySkillBody>
): Promise<SaveDeploySkillResponse> {
  const { skillId, versionName } = SaveDeploySkillBodySchema.parse(req.body);

  if (!skillId || !isValidObjectId(skillId)) {
    return Promise.reject(SkillErrEnum.invalidSkillId);
  }

  // Verify write permission via authSkill (replaces authUserPer + canModifySkill)
  const { teamId, tmbId, skill } = await authSkill({
    req,
    skillId,
    per: WritePermissionVal,
    authToken: true,
    authApiKey: true
  });

  // Fetch the edit-debug sandbox
  const providerConfig = getSandboxProviderConfig();
  const sandboxInfo = await findSandboxInstanceByAppChatType({
    provider: providerConfig.provider,
    appId: skillId,
    chatId: EDIT_DEBUG_SANDBOX_CHAT_ID,
    status: SandboxStatusEnum.running,
    sandboxType: SandboxTypeEnum.editDebug
  });

  if (!sandboxInfo || sandboxInfo.status !== SandboxStatusEnum.running) {
    return Promise.reject(new UserError('Edit sandbox not found or not running'));
  }

  // Package the skill directory from the sandbox
  let packageBuffer: Buffer;
  try {
    packageBuffer = await packageSkillInSandbox({
      sandboxId: sandboxInfo.sandboxId
    });
  } catch (error: any) {
    return Promise.reject(
      new UserError(`Failed to package skill directory: ${error.message || 'Unknown error'}`)
    );
  }

  const skillMdInfos = await extractSkillMdInfosFromBuffer(packageBuffer);
  if (skillMdInfos.length === 0) {
    logger.warn('SKILL.md not found in skill package');
    return Promise.reject(SkillErrEnum.invalidSkillPackage);
  }

  for (const info of skillMdInfos) {
    const { skill: parsedSkill, error: parseError } = extractSkillFromMarkdown(info.content);
    if (parseError || !parsedSkill) {
      return Promise.reject(
        new UserError(`Failed to parse ${info.relativePath}: ${parseError || 'Unknown error'}`)
      );
    }
  }

  // Transaction: create version record and upload package
  const response = await mongoSessionRun(async (session) => {
    const nextVersion = await getNextVersionNumber(skillId, session);

    let storageInfo;
    try {
      storageInfo = await uploadSkillPackage({
        teamId,
        skillId,
        version: nextVersion,
        zipBuffer: packageBuffer
      });
    } catch (error: any) {
      throw new UserError(`Failed to upload package: ${error.message || 'Unknown error'}`);
    }

    await createVersion(
      {
        skillId,
        tmbId,
        version: nextVersion,
        versionName: versionName || `v${nextVersion}`,
        storage: storageInfo
      },
      session
    );
    await updateCurrentStorage(skillId, storageInfo, session);
    await MongoAgentSkills.updateOne(
      { _id: skillId },
      {
        $set: {
          currentVersion: nextVersion,
          versionCount: nextVersion + 1,
          updateTime: new Date()
        }
      },
      { session }
    );
    await setActiveVersion(skillId, nextVersion, session);

    return {
      skillId,
      version: nextVersion,
      versionName: versionName || `v${nextVersion}`,
      storage: { bucket: storageInfo.bucket, key: storageInfo.key, size: storageInfo.size },
      createdAt: new Date().toISOString()
    };
  });

  // Record audit log asynchronously to avoid blocking the response
  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.DEPLOY_SKILL,
      params: { skillName: skill.name, skillType: getI18nSkillType(skill.type) }
    });
  })();

  return SaveDeploySkillResponseSchema.parse(response);
}

export default NextAPI(handler);
