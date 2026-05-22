import { generateSandboxId } from '@fastgpt/global/core/ai/sandbox/constants';
import type { SandboxImageConfigType } from '@fastgpt/global/core/ai/skill/type';
import type { SandboxCreateConfig, SandboxProviderConfig } from '../../sandbox/provider/config';
import type { SandboxDefaults } from '../../sandbox/runtime/config';

export const EDIT_DEBUG_SANDBOX_CHAT_ID = 'edit-debug';

export const getEditDebugSandboxId = (skillId: string) =>
  generateSandboxId(skillId, '', EDIT_DEBUG_SANDBOX_CHAT_ID);

/**
 * 构建编辑态 sandbox 的容器配置。
 *
 * edit-debug 与普通 agent session 的核心区别是必须开启 code-server，
 * 并且以 skillId 作为业务归属，方便后续保存发布和 proxy token 鉴权。
 */
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
      env: {},
      workingDir: defaults.workDirectory,
      metadata: {
        skillId,
        teamId,
        sessionId
      }
    };
  }

  return {
    image: sandboxImage,
    entrypoint: [entrypoint ?? defaults.entrypoint],
    env: {
      FASTGPT_SESSION_ID: sessionId,
      FASTGPT_WORKDIR: defaults.workDirectory
    },
    metadata: {
      skillId,
      teamId,
      sessionId
    }
  };
}
