/**
 * Skill Sandbox Configuration
 *
 * Provides configuration and defaults for sandbox management.
 */

import type { SandboxImageConfigType } from '@fastgpt/global/core/agentSkills/type';
import { serviceEnv } from '../../env';
import { SandboxTypeEnum } from '@fastgpt/global/core/agentSkills/constants';
import { generateSandboxId } from '@fastgpt/global/core/ai/sandbox/constants';
import type { SandboxCreateConfig, SandboxProviderConfig } from '../ai/sandbox/config';
export type { SandboxCreateConfig, SandboxProviderConfig } from '../ai/sandbox/config';

export const EDIT_DEBUG_SANDBOX_CHAT_ID = 'edit-debug';

export const getEditDebugSandboxId = (skillId: string) =>
  generateSandboxId(skillId, '', EDIT_DEBUG_SANDBOX_CHAT_ID);

export type SandboxDefaults = {
  defaultImage: SandboxImageConfigType;
  workDirectory: string;
  entrypoint: string;
};

export type SkillSizeLimits = {
  maxUploadBytes: number; // Compressed upload size limit
  maxUncompressedBytes: number; // Uncompressed size after extraction (Zip Bomb guard)
  maxDownloadBytes: number; // Download from MinIO/S3
  maxSandboxPackageBytes: number; // Sandbox directory size before zip
};

/**
 * Get sandbox default settings
 */
export function getSandboxDefaults(): SandboxDefaults {
  if (serviceEnv.AGENT_SANDBOX_PROVIDER === 'sealosdevbox') {
    return {
      defaultImage: {
        repository: ''
      },
      workDirectory: '/home/devbox/workspace',
      entrypoint: ''
    };
  }

  return {
    defaultImage: {
      repository: serviceEnv.AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO,
      tag: serviceEnv.AGENT_SANDBOX_OPENSANDBOX_IMAGE_TAG
    },
    workDirectory: '/home/sandbox/workspace',
    // workDirectory: serviceEnv.AGENT_SANDBOX_OPENSANDBOX_WORK_DIRECTORY ?? '/home/sandbox/workspace',
    entrypoint: '/home/sandbox/entrypoint.sh'
    // entrypoint: serviceEnv.AGENT_SANDBOX_OPENSANDBOX_ENTRYPOINT ?? '/home/sandbox/entrypoint.sh'
  };
}

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
        sandboxType: SandboxTypeEnum.sessionRuntime,
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
      sandboxType: SandboxTypeEnum.sessionRuntime,
      skillIds: skillIds.join('-'),
      sessionId
    }
  };
}

export function buildEditDebugCreateConfig(params: {
  providerConfig: SandboxProviderConfig;
  sessionId: string;
  sandboxImage: SandboxImageConfigType;
  defaults: SandboxDefaults;
  entrypoint?: string;
  skillId: string;
  teamId: string;
}): SandboxCreateConfig {
  const { providerConfig, sessionId, sandboxImage, defaults, entrypoint, skillId, teamId } = params;

  if (providerConfig.provider === 'sealosdevbox') {
    return {
      env: {
        CODE_SERVER_ENABLED: 'true'
      },
      workingDir: defaults.workDirectory,
      metadata: {
        skillId,
        teamId,
        sandboxType: SandboxTypeEnum.editDebug,
        sessionId
      }
    };
  }

  return {
    image: sandboxImage,
    entrypoint: [entrypoint ?? defaults.entrypoint],
    env: buildBaseContainerEnv(sessionId, defaults.workDirectory, true),
    metadata: {
      skillId,
      teamId,
      sandboxType: SandboxTypeEnum.editDebug,
      sessionId
    }
  };
}
