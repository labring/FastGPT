import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import {
  getSkillById,
  canModifySkill,
  updateCurrentStorage
} from '@fastgpt/service/core/agentSkill/controller';
import { packageSkillInSandbox } from '@fastgpt/service/core/agentSkill/sandboxController';
import {
  createVersion,
  getNextVersionNumber,
  setActiveVersion
} from '@fastgpt/service/core/agentSkill/versionController';
import { uploadSkillPackage } from '@fastgpt/service/core/agentSkill/storage';
import {
  validateZipStructure,
  extractSkillPackage,
  standardizeSkillPackage
} from '@fastgpt/service/core/agentSkill/zipBuilder';
import { extractSkillFromMarkdown } from '@fastgpt/service/core/agentSkill/utils';
import { MongoSkillSandbox } from '@fastgpt/service/core/agentSkill/sandboxSchema';
import { MongoAgentSkill } from '@fastgpt/service/core/agentSkill/schema';
import { SandboxTypeEnum } from '@fastgpt/global/core/agentSkill/constants';
import type {
  SaveDeploySkillBody,
  SaveDeploySkillResponse
} from '@fastgpt/global/core/agentSkill/api';

/**
 * POST /api/core/app/agent/skills/save-deploy
 *
 * Save and deploy a skill from sandbox
 * Packages the skill directory, uploads to MinIO, and creates a new version
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Only POST method allowed
    if (req.method !== 'POST') {
      return jsonRes(res, {
        code: 405,
        error: 'Method not allowed'
      });
    }

    // Authenticate user
    const { teamId, tmbId, userId } = await authUserPer({
      req,
      authToken: true,
      authApiKey: true
    });

    // Parse request body
    const { skillId, versionName, description } = req.body as SaveDeploySkillBody;

    // Validate required parameters
    if (!skillId) {
      return jsonRes(res, {
        code: 400,
        error: 'skillId is required'
      });
    }

    // Get skill info
    const skill = await getSkillById(skillId);

    if (!skill) {
      return jsonRes(res, {
        code: 404,
        error: 'Skill not found'
      });
    }

    // Check if system skill (cannot modify)
    if (skill.source === 'system') {
      return jsonRes(res, {
        code: 403,
        error: 'Cannot modify system skills'
      });
    }

    // Check modification permission
    const canModify = await canModifySkill(skillId, tmbId);

    if (!canModify) {
      return jsonRes(res, {
        code: 403,
        error: 'Access denied'
      });
    }

    // Get edit-debug sandbox info
    const sandboxInfo = await MongoSkillSandbox.findOne({
      skillId,
      sandboxType: SandboxTypeEnum.editDebug,
      deleteTime: null
    });

    if (!sandboxInfo || sandboxInfo.sandbox.status.state !== 'Running') {
      return jsonRes(res, {
        code: 404,
        error: 'Edit sandbox not found or not running'
      });
    }

    // Package skill directory in sandbox
    let packageBuffer: Buffer;

    try {
      packageBuffer = await packageSkillInSandbox({
        providerSandboxId: sandboxInfo.sandbox.sandboxId
      });
    } catch (error: any) {
      return jsonRes(res, {
        code: 500,
        error: `Failed to package skill directory: ${error.message || 'Unknown error'}`
      });
    }

    // Validate ZIP structure
    const validation = await validateZipStructure(packageBuffer);

    if (!validation.valid) {
      return jsonRes(res, {
        code: 500,
        error: `Invalid skill package structure: ${validation.error || 'Unknown error'}`
      });
    }

    // Extract SKILL.md from ZIP
    const extractResult = await extractSkillPackage(packageBuffer);

    if (!extractResult.success || !extractResult.skillMd) {
      return jsonRes(res, {
        code: 500,
        error: 'SKILL.md not found in package'
      });
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

    // Standardize the ZIP package (ensure root folder named after skill)
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

    // Get next version number
    const nextVersion = await getNextVersionNumber(skillId);

    // Create version and upload package with transaction
    const response = await mongoSessionRun(async (session) => {
      // Upload package.zip to MinIO
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

      // Prepare version data - ensure markdown is string
      const versionData = {
        skillId,
        tmbId,
        version: nextVersion,
        versionName: versionName || `v${nextVersion}`,
        name: skillMetadata.name || skill.name,
        markdown: extractResult.skillMd || '',
        config: skillMetadata.config || skill.config,
        description: description || skillMetadata.description || skill.description,
        category: skillMetadata.category || skill.category,
        storage: storageInfo,
        isActive: true
      };

      // Create version record
      try {
        await createVersion(versionData, session);
      } catch (error: any) {
        throw new Error(`Failed to create version: ${error.message || 'Unknown error'}`);
      }

      // Update skill current storage
      try {
        await updateCurrentStorage(skillId, storageInfo, session);
      } catch (error: any) {
        throw new Error(`Failed to update skill storage: ${error.message || 'Unknown error'}`);
      }

      // Update skill current version and metadata
      try {
        await MongoAgentSkill.updateOne(
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
      } catch (error: any) {
        throw new Error(`Failed to update skill: ${error.message || 'Unknown error'}`);
      }

      // Set new version as active
      try {
        await setActiveVersion(skillId, nextVersion, session);
      } catch (error: any) {
        throw new Error(`Failed to set active version: ${error.message || 'Unknown error'}`);
      }

      // Build response
      return {
        skillId,
        version: nextVersion,
        versionName: versionName || `v${nextVersion}`,
        storage: {
          bucket: storageInfo.bucket,
          key: storageInfo.key,
          size: storageInfo.size
        },
        createdAt: new Date().toISOString()
      };
    });

    jsonRes<SaveDeploySkillResponse>(res, {
      data: response
    });
  } catch (err: any) {
    console.error('[API] Save-deploy skill error:', err);

    // Handle specific error types
    if (err.message?.includes('not found')) {
      return jsonRes(res, {
        code: 404,
        error: err.message || 'Resource not found'
      });
    }

    if (err.message?.includes('access denied') || err.message?.includes('permission')) {
      return jsonRes(res, {
        code: 403,
        error: err.message || 'Access denied'
      });
    }

    // Generic error
    jsonRes(res, {
      code: 500,
      error: err.message || 'Failed to save and deploy skill'
    });
  }
}
