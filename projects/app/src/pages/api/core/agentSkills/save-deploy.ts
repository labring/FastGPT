import { NextAPI } from '@/service/middleware/entry';
import { authSkill } from '@fastgpt/service/support/permission/agentSkill/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { updateCurrentStorage } from '@fastgpt/service/core/agentSkills/controller';
import { packageSkillInSandbox } from '@fastgpt/service/core/agentSkills/sandboxController';
import {
  createVersion,
  getNextVersionNumber,
  setActiveVersion
} from '@fastgpt/service/core/agentSkills/version/controller';
import { uploadSkillPackage } from '@fastgpt/service/core/agentSkills/storage';
import {
  validateZipStructure,
  extractSkillPackage,
  standardizeSkillPackage
} from '@fastgpt/service/core/agentSkills/zipBuilder';
import { extractSkillFromMarkdown } from '@fastgpt/service/core/agentSkills/utils';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import { MongoAgentSkills } from '@fastgpt/service/core/agentSkills/schema';
import { SandboxTypeEnum } from '@fastgpt/global/core/agentSkills/constants';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import type {
  SaveDeploySkillBody,
  SaveDeploySkillResponse
} from '@fastgpt/global/core/agentSkills/api';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { addAuditLog, getI18nSkillType } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { isValidObjectId } from 'mongoose';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/agentSkill';
import { UserError } from '@fastgpt/global/common/error/utils';
import type { ApiRequestProps } from '@fastgpt/service/type/next';

/**
 * Package and deploy a skill from sandbox, creating a new version.
 */
async function handler(
  req: ApiRequestProps<SaveDeploySkillBody>
): Promise<SaveDeploySkillResponse> {
  const { skillId, versionName } = req.body;

  if (!skillId || !isValidObjectId(skillId)) {
    return Promise.reject(SkillErrEnum.unExist);
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
  const sandboxInfo = await MongoSandboxInstance.findOne({
    appId: skillId,
    chatId: 'edit-debug',
    status: SandboxStatusEnum.running,
    'metadata.sandboxType': SandboxTypeEnum.editDebug
  });

  if (!sandboxInfo || sandboxInfo.status !== SandboxStatusEnum.running) {
    return Promise.reject(new UserError('Edit sandbox not found or not running'));
  }

  // Package the skill directory from the sandbox
  let packageBuffer: Buffer;
  try {
    packageBuffer = await packageSkillInSandbox({
      providerSandboxId: sandboxInfo.metadata?.providerSandboxId ?? sandboxInfo.sandboxId
    });
  } catch (error: any) {
    return Promise.reject(
      new UserError(`Failed to package skill directory: ${error.message || 'Unknown error'}`)
    );
  }

  // Validate the ZIP structure
  const validation = await validateZipStructure(packageBuffer);
  if (!validation.valid) {
    return Promise.reject(SkillErrEnum.invalidSkillPackage);
  }

  // Extract SKILL.md from the ZIP
  const extractResult = await extractSkillPackage(packageBuffer);
  if (!extractResult.success || !extractResult.skillMd) {
    return Promise.reject(SkillErrEnum.invalidSkillPackage);
  }

  // Parse skill metadata from SKILL.md frontmatter
  const { skill: skillMetadata, error: parseError } = extractSkillFromMarkdown(
    extractResult.skillMd
  );
  if (parseError || !skillMetadata) {
    return Promise.reject(
      new UserError(`Failed to parse SKILL.md: ${parseError || 'Unknown error'}`)
    );
  }

  // Standardize the ZIP package (ensure the root folder is named after the skill)
  let standardizedPackageBuffer: Buffer;
  try {
    const { buffer } = await standardizeSkillPackage(packageBuffer, skillMetadata.name);
    standardizedPackageBuffer = buffer;
  } catch (error: any) {
    return Promise.reject(
      new UserError(`Failed to standardize skill package: ${error.message || 'Unknown error'}`)
    );
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
        zipBuffer: standardizedPackageBuffer
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

  return response;
}

export default NextAPI(handler);
