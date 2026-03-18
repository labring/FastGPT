import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
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

/**
 * Package and deploy a skill from sandbox, creating a new version.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') {
      return jsonRes(res, { code: 405, error: 'Method not allowed' });
    }

    const { skillId, versionName } = req.body as SaveDeploySkillBody;

    if (!skillId) {
      return jsonRes(res, { code: 400, error: 'skillId is required' });
    }

    if (!isValidObjectId(skillId)) {
      return jsonRes(res, { code: 400, error: 'Invalid skill ID format' });
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

    if (!sandboxInfo || sandboxInfo.metadata?.providerStatus?.state !== 'Running') {
      return jsonRes(res, {
        code: 404,
        error: 'Edit sandbox not found or not running'
      });
    }

    // Package the skill directory from the sandbox
    let packageBuffer: Buffer;
    try {
      packageBuffer = await packageSkillInSandbox({
        providerSandboxId: sandboxInfo.sandboxId
      });
    } catch (error: any) {
      return jsonRes(res, {
        code: 500,
        error: `Failed to package skill directory: ${error.message || 'Unknown error'}`
      });
    }

    // Validate the ZIP structure
    const validation = await validateZipStructure(packageBuffer);
    if (!validation.valid) {
      return jsonRes(res, {
        code: 500,
        error: `Invalid skill package structure: ${validation.error || 'Unknown error'}`
      });
    }

    // Extract SKILL.md from the ZIP
    const extractResult = await extractSkillPackage(packageBuffer);
    if (!extractResult.success || !extractResult.skillMd) {
      return jsonRes(res, { code: 500, error: 'SKILL.md not found in package' });
    }

    // Parse skill metadata from SKILL.md frontmatter
    const { skill: skillMetadata, error: parseError } = extractSkillFromMarkdown(
      extractResult.skillMd
    );
    if (parseError || !skillMetadata) {
      return jsonRes(res, {
        code: 500,
        error: `Failed to parse SKILL.md: ${parseError || 'Unknown error'}`
      });
    }

    // Standardize the ZIP package (ensure the root folder is named after the skill)
    let standardizedPackageBuffer: Buffer;
    try {
      const { buffer } = await standardizeSkillPackage(packageBuffer, skillMetadata.name);
      standardizedPackageBuffer = buffer;
    } catch (error: any) {
      return jsonRes(res, {
        code: 500,
        error: `Failed to standardize skill package: ${error.message || 'Unknown error'}`
      });
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
        throw new Error(`Failed to upload package: ${error.message || 'Unknown error'}`);
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

    jsonRes<SaveDeploySkillResponse>(res, { data: response });
  } catch (err: any) {
    console.error('[API] Save-deploy skill error:', err);
    jsonRes(res, {
      code: 500,
      error: err.message || 'Failed to save and deploy skill'
    });
  }
}
