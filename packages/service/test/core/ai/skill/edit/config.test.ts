import { describe, expect, it } from 'vitest';
import {
  buildEditDebugCreateConfig,
  EDIT_DEBUG_SANDBOX_CHAT_ID,
  getEditDebugSandboxId
} from '@fastgpt/service/core/ai/skill/edit/config';

const sealosProviderConfig = {
  provider: 'sealosdevbox' as const,
  baseUrl: 'https://devbox.example.com',
  token: 'sealos-token'
};

const opensandboxProviderConfig = {
  provider: 'opensandbox' as const,
  baseUrl: 'http://opensandbox.local',
  runtime: 'docker' as const
};

describe('skill edit config', () => {
  it('builds correct create config for sealosdevbox edit-debug', () => {
    const result = buildEditDebugCreateConfig({
      providerConfig: sealosProviderConfig,
      sessionId: 'session-1',
      sandboxImage: { repository: 'ignored-for-sealos' },
      defaults: {
        defaultImage: { repository: '' },
        workDirectory: '/home/devbox/workspace',
        entrypoint: ''
      },
      skillId: 'skill-1',
      teamId: 'team-1'
    });

    expect(result).toEqual({
      env: {},
      workingDir: '/home/devbox/workspace',
      metadata: {
        skillId: 'skill-1',
        teamId: 'team-1',
        sessionId: 'session-1'
      }
    });
  });

  it('builds correct create config for container provider edit-debug', () => {
    const result = buildEditDebugCreateConfig({
      providerConfig: opensandboxProviderConfig,
      sessionId: 'session-1',
      sandboxImage: { repository: 'debug-image', tag: 'stable' },
      defaults: {
        defaultImage: { repository: 'runtime-image' },
        workDirectory: '/workspace',
        entrypoint: '/home/sandbox/entrypoint.sh'
      },
      skillId: 'skill-1',
      teamId: 'team-1'
    });

    expect(result).toEqual({
      image: { repository: 'debug-image', tag: 'stable' },
      entrypoint: ['/home/sandbox/entrypoint.sh'],
      env: {
        FASTGPT_SESSION_ID: 'session-1',
        FASTGPT_WORKDIR: '/workspace'
      },
      metadata: {
        skillId: 'skill-1',
        teamId: 'team-1',
        sessionId: 'session-1'
      }
    });
  });

  it('builds edit-debug sandbox id from skill id and edit-debug chat id only', () => {
    expect(EDIT_DEBUG_SANDBOX_CHAT_ID).toBe('edit-debug');
    expect(getEditDebugSandboxId('skill-1')).toBe(getEditDebugSandboxId('skill-1'));
    expect(getEditDebugSandboxId('skill-1')).not.toBe(getEditDebugSandboxId('skill-2'));
  });
});
