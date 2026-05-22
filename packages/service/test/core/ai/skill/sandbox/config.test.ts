import { describe, expect, it } from 'vitest';
import { buildSessionRuntimeCreateConfig } from '@fastgpt/service/core/ai/skill/sandbox/config';

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

describe('skill sandbox config', () => {
  it('builds session-runtime create config for sealosdevbox without default image or entrypoint', () => {
    const result = buildSessionRuntimeCreateConfig({
      providerConfig: sealosProviderConfig,
      sessionId: 'session-1',
      defaults: {
        defaultImage: { repository: '' },
        workDirectory: '/home/devbox/workspace',
        entrypoint: ''
      },
      teamId: 'team-1',
      tmbId: 'member-1',
      skillIds: ['skill-1', 'skill-2']
    });

    expect(result).toEqual({
      env: {
        FASTGPT_SESSION_ID: 'session-1',
        FASTGPT_WORKDIR: '/home/devbox/workspace'
      },
      workingDir: '/home/devbox/workspace',
      metadata: {
        teamId: 'team-1',
        tmbId: 'member-1',
        skillIds: 'skill-1-skill-2',
        sessionId: 'session-1'
      }
    });
  });

  it('keeps explicit image override in session-runtime create config for sealosdevbox', () => {
    const result = buildSessionRuntimeCreateConfig({
      providerConfig: sealosProviderConfig,
      sessionId: 'session-1',
      defaults: {
        defaultImage: { repository: '' },
        workDirectory: '/home/devbox/workspace',
        entrypoint: ''
      },
      image: { repository: 'custom-devbox-runtime', tag: 'test' },
      teamId: 'team-1',
      tmbId: 'member-1',
      skillIds: []
    });

    expect(result.image).toEqual({ repository: 'custom-devbox-runtime', tag: 'test' });
    expect(result.entrypoint).toBeUndefined();
  });

  it('builds session-runtime create config for container providers', () => {
    const result = buildSessionRuntimeCreateConfig({
      providerConfig: opensandboxProviderConfig,
      sessionId: 'session-1',
      defaults: {
        defaultImage: { repository: 'default-image', tag: 'stable' },
        workDirectory: '/workspace',
        entrypoint: '/home/sandbox/entrypoint.sh'
      },
      teamId: 'team-1',
      tmbId: 'member-1',
      skillIds: ['skill-1']
    });

    expect(result).toEqual({
      image: { repository: 'default-image', tag: 'stable' },
      entrypoint: ['/home/sandbox/entrypoint.sh'],
      env: {
        FASTGPT_SESSION_ID: 'session-1',
        FASTGPT_WORKDIR: '/workspace'
      },
      metadata: {
        teamId: 'team-1',
        tmbId: 'member-1',
        skillIds: 'skill-1',
        sessionId: 'session-1'
      }
    });
  });
});
