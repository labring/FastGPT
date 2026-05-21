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

const MB_TO_BYTES = 1024 * 1024;
const mbToBytes = (value: number) => value * MB_TO_BYTES;

/**
 * Get skill size limits from the single Skill package size environment variable.
 *
 * AGENT_SKILL_MAX_UPLOAD_SIZE follows the existing upload-file convention and is configured in MB.
 * Runtime checks compare File/Buffer byte lengths, so this function exposes byte values only. The
 * derived fields keep call sites explicit about which boundary they are enforcing.
 */
export function getSkillSizeLimits(): SkillSizeLimits {
  const maxPackageBytes = mbToBytes(serviceEnv.AGENT_SKILL_MAX_UPLOAD_SIZE);

  return {
    maxUploadBytes: maxPackageBytes,
    maxUncompressedBytes: maxPackageBytes,
    maxDownloadBytes: maxPackageBytes,
    maxSandboxPackageBytes: maxPackageBytes
  };
}

/**
 * Build container env vars for the sandbox process.
 */
export function buildBaseContainerEnv(
  sessionId: string,
  workDirectory: string
): Record<string, string> {
  return {
    FASTGPT_SESSION_ID: sessionId,
    FASTGPT_WORKDIR: workDirectory
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
      env: buildBaseContainerEnv(sessionId, defaults.workDirectory),
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
    env: buildBaseContainerEnv(sessionId, defaults.workDirectory),
    metadata: {
      teamId,
      tmbId,
      skillIds: skillIds.join('-'),
      sessionId
    }
  };
}
