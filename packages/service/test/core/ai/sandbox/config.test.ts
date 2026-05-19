import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalEnv = {
  AGENT_SANDBOX_PROVIDER: process.env.AGENT_SANDBOX_PROVIDER,
  AGENT_SANDBOX_SEALOS_BASEURL: process.env.AGENT_SANDBOX_SEALOS_BASEURL,
  AGENT_SANDBOX_SEALOS_TOKEN: process.env.AGENT_SANDBOX_SEALOS_TOKEN,
  AGENT_SANDBOX_OPENSANDBOX_RUNTIME: process.env.AGENT_SANDBOX_OPENSANDBOX_RUNTIME
};

const loadSandboxConfigModule = async () => {
  vi.resetModules();
  return import('@fastgpt/service/core/ai/sandbox/config');
};

const loadSkillSandboxConfigModule = async () => {
  vi.resetModules();
  return import('@fastgpt/service/core/agentSkills/sandboxConfig');
};

const sealosProviderConfig = {
  provider: 'sealosdevbox' as const,
  baseUrl: 'https://devbox.example.com',
  token: 'sealos-token'
};

describe('sandbox config helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.stubEnv('AGENT_SANDBOX_PROVIDER', originalEnv.AGENT_SANDBOX_PROVIDER);
    vi.stubEnv('AGENT_SANDBOX_SEALOS_BASEURL', originalEnv.AGENT_SANDBOX_SEALOS_BASEURL);
    vi.stubEnv('AGENT_SANDBOX_SEALOS_TOKEN', originalEnv.AGENT_SANDBOX_SEALOS_TOKEN);
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_RUNTIME', originalEnv.AGENT_SANDBOX_OPENSANDBOX_RUNTIME);
    vi.unstubAllGlobals();
  });

  it('parses sealosdevbox config from env', async () => {
    vi.stubEnv('AGENT_SANDBOX_PROVIDER', 'sealosdevbox');
    vi.stubEnv('AGENT_SANDBOX_SEALOS_BASEURL', 'https://devbox.example.com');
    vi.stubEnv('AGENT_SANDBOX_SEALOS_TOKEN', 'sealos-token');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_RUNTIME', 'docker');

    const { getSandboxProviderConfig } = await loadSandboxConfigModule();

    const config = getSandboxProviderConfig();

    expect(config).toEqual({
      provider: 'sealosdevbox',
      baseUrl: 'https://devbox.example.com',
      token: 'sealos-token'
    });
  });

  it('builds session-runtime create config for sealosdevbox without default image or entrypoint', async () => {
    const { buildSessionRuntimeCreateConfig } = await loadSkillSandboxConfigModule();

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
        FASTGPT_WORKDIR: '/home/devbox/workspace',
        FASTGPT_ENABLE_CODE_SERVER: 'false'
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

  it('keeps explicit image override in session-runtime create config for sealosdevbox', async () => {
    const { buildSessionRuntimeCreateConfig } = await loadSkillSandboxConfigModule();

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

  it('only enables code-server for sealosdevbox edit-debug create config', async () => {
    const { buildEditDebugCreateConfig } = await loadSkillSandboxConfigModule();

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
      env: {
        CODE_SERVER_ENABLED: 'true'
      },
      workingDir: '/home/devbox/workspace',
      metadata: {
        skillId: 'skill-1',
        teamId: 'team-1',
        sessionId: 'session-1'
      }
    });
  });

  it('validates sealosdevbox token requirement', async () => {
    const { validateSandboxConfig } = await loadSandboxConfigModule();

    expect(() =>
      validateSandboxConfig({
        provider: 'sealosdevbox',
        baseUrl: 'https://devbox.example.com',
        token: ''
      })
    ).toThrow('Sandbox provider token is required for sealosdevbox');
  });

  it('builds edit-debug sandbox id from skill id and edit-debug chat id only', async () => {
    const { EDIT_DEBUG_SANDBOX_CHAT_ID, getEditDebugSandboxId } =
      await loadSkillSandboxConfigModule();

    expect(EDIT_DEBUG_SANDBOX_CHAT_ID).toBe('edit-debug');
    expect(getEditDebugSandboxId('skill-1')).toBe(getEditDebugSandboxId('skill-1'));
    expect(getEditDebugSandboxId('skill-1')).not.toBe(getEditDebugSandboxId('skill-2'));
  });
});
