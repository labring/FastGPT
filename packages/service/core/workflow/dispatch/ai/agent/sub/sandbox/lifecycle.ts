/**
 * Agent Sandbox Lifecycle Management
 *
 * Manages sandbox creation/destruction for agent skill execution.
 * Unlike edit-debug sandboxes, these are session-runtime sandboxes
 * that are not persisted to MongoDB.
 */

import { createSandbox } from '@anyany/sandbox_provider';
import type { ISandbox } from '@anyany/sandbox_provider';
import { MongoAgentSkill } from '../../../../../../agentSkill/schema';
import { MongoSkillVersion } from '../../../../../../agentSkill/versionSchema';
import { downloadSkillPackage } from '../../../../../../agentSkill/storage';
import { standardizeSkillPackage } from '../../../../../../agentSkill/zipBuilder';
import {
  getSandboxProviderConfig,
  getSandboxDefaults,
  validateSandboxConfig
} from '../../../../../../agentSkill/sandboxConfig';
import type { AgentSandboxContext } from './types';
import { getLogger, LogCategories } from '../../../../../../../common/logger';

type CreateAgentSandboxParams = {
  skillIds: string[];
  teamId: string;
  tmbId: string;
};

const logger = getLogger(LogCategories.MODULE.AI.AGENT);

/**
 * Create a session-runtime sandbox for agent skill execution.
 *
 * Process:
 * 1. Batch query skills from MongoDB
 * 2. Get active versions for each skill
 * 3. Create sandbox via sandbox_provider
 * 4. Download, standardize, and deploy each skill package
 * 5. Return AgentSandboxContext
 */
export async function createAgentSandbox(
  params: CreateAgentSandboxParams
): Promise<AgentSandboxContext> {
  const { skillIds, teamId, tmbId } = params;

  const providerConfig = getSandboxProviderConfig();
  const defaults = getSandboxDefaults();
  validateSandboxConfig(providerConfig);

  logger.info('[Agent Sandbox] Creating session-runtime sandbox', {
    skillIds,
    teamId
  });

  // Step 1: Batch query skills
  const skills = await MongoAgentSkill.find({
    _id: { $in: skillIds },
    teamId,
    deleteTime: null
  });

  if (skills.length === 0) {
    throw new Error('No valid skills found');
  }

  // Step 2: Get active versions for each skill
  const activeVersions = await MongoSkillVersion.find({
    skillId: { $in: skills.map((s) => s._id) },
    isActive: true,
    isDeleted: false
  });

  const versionMap = new Map(activeVersions.map((v) => [String(v.skillId), v]));

  // Filter skills that have active versions with storage
  const deployableSkills = skills.filter((skill) => {
    const version = versionMap.get(String(skill._id));
    return version && skill.currentStorage;
  });

  if (deployableSkills.length === 0) {
    throw new Error('No deployable skills found (missing active versions)');
  }

  // Step 3: Create sandbox
  let sandbox: ISandbox | null = null;

  try {
    sandbox = createSandbox({
      provider: 'opensandbox',
      connection: {
        apiKey: providerConfig.apiKey,
        baseUrl: providerConfig.baseUrl,
        runtime: providerConfig.runtime
      }
    });

    await sandbox.create({
      image: defaults.defaultImage,
      timeout: defaults.timeout,
      metadata: {
        teamId,
        tmbId,
        sandboxType: 'agent-runtime',
        skillIds: skillIds.join('--')
      }
    });

    await sandbox.waitUntilReady(60000);

    const sandboxInfo = await sandbox.getInfo();

    logger.info('[Agent Sandbox] Sandbox created', {
      providerSandboxId: sandboxInfo.id
    });

    // Step 4: Deploy each skill
    for (const skill of deployableSkills) {
      const version = versionMap.get(String(skill._id))!;

      try {
        // Download package from storage
        const packageBuffer = await downloadSkillPackage({
          storageInfo: version.storage
        });

        // Standardize ZIP structure
        const { buffer: standardizedBuffer } = await standardizeSkillPackage(
          packageBuffer,
          skill.name
        );

        // Upload and extract to sandbox
        const zipPath = `${defaults.workDirectory}/package_${skill.name}.zip`;
        await sandbox.writeFiles([
          {
            path: zipPath,
            data: standardizedBuffer
          }
        ]);

        // Extract to skill-specific directory
        const extractResult = await sandbox.execute(
          `cd ${defaults.workDirectory} && unzip -o package_${skill.name}.zip && rm package_${skill.name}.zip`
        );

        if (extractResult.exitCode !== 0) {
          logger.error('[Agent Sandbox] Failed to extract skill package', {
            skillName: skill.name,
            stderr: extractResult.stderr
          });
          continue;
        }

        logger.info('[Agent Sandbox] Skill deployed', {
          skillName: skill.name,
          directory: `${defaults.workDirectory}/${skill.name}`
        });
      } catch (error) {
        logger.error('[Agent Sandbox] Failed to deploy skill', {
          skillName: skill.name,
          error
        });
        // Continue deploying other skills
      }
    }

    return {
      sandbox,
      providerSandboxId: sandboxInfo.id,
      skills: deployableSkills.map((s) => s.toJSON()),
      workDirectory: defaults.workDirectory,
      isReady: true
    };
  } catch (error) {
    logger.error('[Agent Sandbox] Failed to create sandbox', { error });

    // Cleanup on failure
    if (sandbox) {
      try {
        await sandbox.delete();
      } catch (cleanupError) {
        logger.error('[Agent Sandbox] Cleanup failed after creation error', { cleanupError });
      }
      await sandbox.close();
    }

    throw error;
  }
}

/**
 * Destroy an agent session-runtime sandbox.
 * Fire-and-forget mode - does not persist to MongoDB.
 */
export async function destroyAgentSandbox(ctx: AgentSandboxContext): Promise<void> {
  try {
    logger.info('[Agent Sandbox] Destroying sandbox', {
      providerSandboxId: ctx.providerSandboxId
    });

    await ctx.sandbox.delete();
    await ctx.sandbox.close();

    logger.info('[Agent Sandbox] Sandbox destroyed');
  } catch (error) {
    logger.error('[Agent Sandbox] Failed to destroy sandbox', { error });
    // Best-effort close
    try {
      await ctx.sandbox.close();
    } catch {
      // Ignore close errors
    }
  }
}
