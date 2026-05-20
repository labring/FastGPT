/**
 * Skill Sandbox Configuration
 *
 * Provides configuration and defaults for sandbox management.
 */

import type { SandboxImageConfigType } from '@fastgpt/global/core/ai/skill/type';
import { serviceEnv } from '../../../../env';
import type { SandboxCreateConfig, SandboxProviderConfig } from '../../sandbox/config';
import { type SandboxDefaults } from '../../sandbox/config';

export {
  EDIT_DEBUG_SANDBOX_CHAT_ID,
  getEditDebugSandboxId,
  buildEditDebugCreateConfig
} from '../edit/config';

export type SkillSizeLimits = {
  maxUploadBytes: number; // Compressed upload size limit
  maxUncompressedBytes: number; // Uncompressed size after extraction (Zip Bomb guard)
  maxDownloadBytes: number; // Download from MinIO/S3
  maxSandboxPackageBytes: number; // Sandbox directory size before zip
};

/**
 * Get skill size limits from environment variables
 */
export function getSkillSizeLimits(): SkillSizeLimits {
  return {
    maxUploadBytes: serviceEnv.AGENT_SKILL_MAX_UPLOAD_SIZE,
    maxUncompressedBytes: serviceEnv.AGENT_SKILL_MAX_UNCOMPRESSED_SIZE,
    maxDownloadBytes: serviceEnv.AGENT_SKILL_MAX_DOWNLOAD_SIZE,
    maxSandboxPackageBytes: serviceEnv.AGENT_SKILL_MAX_SANDBOX_SIZE
  };
}

/**
 * Build container env vars for the sandbox process.
 */
export function buildBaseContainerEnv(
  sessionId: string,
  workDirectory: string,
  enableCodeServer: boolean
): Record<string, string> {
  return {
    FASTGPT_SESSION_ID: sessionId,
    FASTGPT_WORKDIR: workDirectory,
    FASTGPT_ENABLE_CODE_SERVER: enableCodeServer ? 'true' : 'false'
  };
}

export function buildSessionRuntimeCreateConfig(params: {
  providerConfig: SandboxProviderConfig;
  sessionId: string;
  defaults: SandboxDefaults;
  entrypoint?: string;
  image?: SandboxImageConfigType;
  teamId: string;
  tmbId: string;
  skillIds: string[];
}): SandboxCreateConfig {
  const { providerConfig, sessionId, defaults, entrypoint, image, teamId, tmbId, skillIds } =
    params;

  if (providerConfig.provider === 'sealosdevbox') {
    return {
      ...(image ? { image } : {}),
      env: buildBaseContainerEnv(sessionId, defaults.workDirectory, false),
      workingDir: defaults.workDirectory,
      metadata: {
        teamId,
        tmbId,
        skillIds: skillIds.join('-'),
        sessionId
      }
    };
  }

  return {
    image: image ?? defaults.defaultImage,
    entrypoint: [entrypoint ?? defaults.entrypoint],
    env: buildBaseContainerEnv(sessionId, defaults.workDirectory, false),
    metadata: {
      teamId,
      tmbId,
      skillIds: skillIds.join('-'),
      sessionId
    }
  };
}
