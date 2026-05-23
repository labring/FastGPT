import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateSandboxId } from '@fastgpt/global/core/ai/sandbox/constants';

vi.mock('@fastgpt/service/env', () => ({
  serviceEnv: {
    AGENT_SANDBOX_PROVIDER: 'sealosdevbox'
  }
}));

const mocks = vi.hoisted(() => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn()
  },
  buildRuntimeSandboxAdapter: vi.fn(),
  ensureConnectedSandboxRunning: vi.fn(),
  deleteSandboxResource: vi.fn(),
  stopSandboxResource: vi.fn(),
  getSessionVolumeConfig: vi.fn(),
  upsertRunningSandboxInstance: vi.fn(),
  findSandboxAppIdBySandboxId: vi.fn(),
  mongoAppFindById: vi.fn(),
  mongoAgentSkillsFindById: vi.fn(),
  checkTeamSandboxPermission: vi.fn()
}));

vi.mock('@fastgpt/service/common/logger', () => ({
  getLogger: () => mocks.logger,
  LogCategories: {
    MODULE: {
      AI: {
        SANDBOX: 'sandbox'
      }
    }
  }
}));

vi.mock('@fastgpt/service/core/ai/sandbox/provider/adapter', () => ({
  buildRuntimeSandboxAdapter: mocks.buildRuntimeSandboxAdapter
}));

vi.mock('@fastgpt/service/core/ai/sandbox/provider/lifecycle', () => ({
  ensureConnectedSandboxRunning: mocks.ensureConnectedSandboxRunning
}));

vi.mock('@fastgpt/service/core/ai/sandbox/service/resource', () => ({
  deleteSandboxResource: mocks.deleteSandboxResource,
  stopSandboxResource: mocks.stopSandboxResource
}));

vi.mock('@fastgpt/service/core/ai/sandbox/volume/service', () => ({
  getSessionVolumeConfig: mocks.getSessionVolumeConfig
}));

vi.mock('@fastgpt/service/core/ai/sandbox/instance/repository', () => ({
  findSandboxAppIdBySandboxId: mocks.findSandboxAppIdBySandboxId,
  upsertRunningSandboxInstance: mocks.upsertRunningSandboxInstance
}));

vi.mock('@fastgpt/service/core/app/schema', () => ({
  MongoApp: {
    findById: mocks.mongoAppFindById
  }
}));

vi.mock('@fastgpt/service/core/ai/skill/model/schema', () => ({
  MongoAgentSkills: {
    findById: mocks.mongoAgentSkillsFindById
  }
}));

vi.mock('@fastgpt/service/support/permission/teamLimit', () => ({
  checkTeamSandboxPermission: mocks.checkTeamSandboxPermission
}));

import { getSandboxClient, SandboxClient } from '@fastgpt/service/core/ai/sandbox/service/runtime';

const mockLeanResult = <T>(value: T) => ({
  lean: vi.fn(async () => value)
});

const createProvider = () =>
  ({
    provider: 'sealosdevbox',
    execute: vi.fn(async () => ({ stdout: 'ok', stderr: '', exitCode: 0 }))
  }) as any;

describe('sandbox runtime service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionVolumeConfig.mockResolvedValue(undefined);
    mocks.upsertRunningSandboxInstance.mockResolvedValue(undefined);
    mocks.ensureConnectedSandboxRunning.mockResolvedValue(undefined);
    mocks.deleteSandboxResource.mockResolvedValue(undefined);
    mocks.stopSandboxResource.mockResolvedValue(undefined);
    mocks.buildRuntimeSandboxAdapter.mockReturnValue(createProvider());
    mocks.findSandboxAppIdBySandboxId.mockResolvedValue(undefined);
    mocks.mongoAppFindById.mockReturnValue(mockLeanResult(null));
    mocks.mongoAgentSkillsFindById.mockReturnValue(mockLeanResult(null));
    mocks.checkTeamSandboxPermission.mockResolvedValue(undefined);
  });

  it('gets a sandbox client by stable sandbox id and ensures it is available', async () => {
    const client = await getSandboxClient({ sandboxId: 'sandbox-ready-check' });

    expect(client.getSandboxId()).toBe('sandbox-ready-check');
    expect(mocks.getSessionVolumeConfig).toHaveBeenCalledWith('sandbox-ready-check');
    expect(mocks.buildRuntimeSandboxAdapter).toHaveBeenCalledWith(
      'sealosdevbox',
      'sandbox-ready-check',
      expect.objectContaining({
        vmConfig: undefined
      })
    );
    expect(mocks.upsertRunningSandboxInstance).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'sealosdevbox',
        sandboxId: 'sandbox-ready-check',
        metadata: {
          volumeEnabled: false
        }
      })
    );
    expect(mocks.ensureConnectedSandboxRunning).toHaveBeenCalledTimes(1);
  });

  it('builds sandbox id from app/user/chat triplet and omits user for edit-debug chat', async () => {
    const client = await getSandboxClient({
      appId: 'app-1',
      userId: 'user-1',
      chatId: 'edit-debug'
    });

    expect(client.getSandboxId()).toBe(generateSandboxId('app-1', '', 'edit-debug'));
  });

  it('builds sandbox id from app/user/chat triplet for normal chat', async () => {
    const client = await getSandboxClient({
      appId: 'app-1',
      userId: 'user-1',
      chatId: 'normal-chat'
    });

    expect(client.getSandboxId()).toBe(generateSandboxId('app-1', 'user-1', 'normal-chat'));
  });

  it('passes resource limits into running instance records and command timeout into exec', async () => {
    const provider = createProvider();
    mocks.buildRuntimeSandboxAdapter.mockReturnValueOnce(provider);
    const client = new SandboxClient(
      { sandboxId: 'sandbox-with-limits' },
      {
        resourceLimits: {
          cpuCount: 2,
          memoryMiB: 1024,
          diskGiB: 4
        },
        vmConfig: {
          volumes: [{ name: 'workspace', pvc: { claimName: 'claim-1' }, mountPath: '/workspace' }],
          storage: { mountPath: '/workspace' }
        }
      }
    );

    await expect(client.exec('echo ok', 2)).resolves.toEqual({
      stdout: 'ok',
      stderr: '',
      exitCode: 0
    });
    expect(provider.execute).toHaveBeenCalledWith('echo ok', { timeoutMs: 2_000 });
    expect(mocks.upsertRunningSandboxInstance).toHaveBeenCalledWith(
      expect.objectContaining({
        sandboxId: 'sandbox-with-limits',
        storage: { mountPath: '/workspace' },
        limit: {
          cpuCount: 2,
          memoryMiB: 1024,
          diskGiB: 4
        },
        metadata: {
          volumeEnabled: true
        }
      })
    );
  });

  it('uses resource service when runtime client stop and delete are called', async () => {
    const client = new SandboxClient({ sandboxId: 'runtime-cleanup-sandbox' });

    await client.stop();
    await client.delete();

    expect(mocks.stopSandboxResource).toHaveBeenCalledWith({
      provider: 'sealosdevbox',
      sandboxId: 'runtime-cleanup-sandbox'
    });
    expect(mocks.deleteSandboxResource).toHaveBeenCalledWith({
      provider: 'sealosdevbox',
      sandboxId: 'runtime-cleanup-sandbox'
    });
  });

  it('returns execute result error when ensureAvailable fails before exec', async () => {
    mocks.ensureConnectedSandboxRunning.mockRejectedValueOnce(new Error('ensure failed'));
    const client = new SandboxClient({ sandboxId: 'sandbox-ensure-fail' });

    await expect(client.exec('echo never')).resolves.toMatchObject({
      stdout: '',
      stderr: expect.stringContaining('Sandbox service is not available'),
      exitCode: -1
    });
  });

  it('returns execute result error when provider command fails', async () => {
    const provider = createProvider();
    provider.execute.mockRejectedValueOnce(new Error('execute failed'));
    mocks.buildRuntimeSandboxAdapter.mockReturnValueOnce(provider);
    const client = new SandboxClient(
      { sandboxId: 'sandbox-execute-fail' },
      {
        providerName: 'opensandbox',
        createConfig: {
          image: { repository: 'test-image' }
        }
      }
    );

    await expect(client.exec('echo fail')).resolves.toMatchObject({
      stdout: '',
      stderr: expect.stringContaining('Failed to execute sandbox'),
      exitCode: -1
    });
  });
});
