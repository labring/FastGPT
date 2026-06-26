import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  assertSandboxNotArchivedOrBusy: vi.fn(),
  restoreArchivedSandboxBeforeUse: vi.fn(),
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
  upsertRunningSandboxInstance: mocks.upsertRunningSandboxInstance
}));

vi.mock('@fastgpt/service/core/ai/sandbox/service/archive', () => {
  class SandboxArchiveStateError extends Error {
    constructor(readonly state: string) {
      super(`Sandbox is ${state}`);
      this.name = 'SandboxArchiveStateError';
    }
  }

  return {
    SandboxArchiveStateError,
    assertSandboxNotArchivedOrBusy: mocks.assertSandboxNotArchivedOrBusy,
    restoreArchivedSandboxBeforeUse: mocks.restoreArchivedSandboxBeforeUse
  };
});

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
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

const mockLeanResult = <T>(value: T) => ({
  lean: vi.fn(async () => value)
});

const createProvider = () =>
  ({
    provider: 'sealosdevbox',
    execute: vi.fn(async () => ({ stdout: 'ok', stderr: '', exitCode: 0 }))
  }) as any;

const createSandboxIdQuery = (sandboxId: string) => ({
  sandboxId,
  sourceType: ChatSourceTypeEnum.app,
  sourceId: 'app-1',
  userId: 'user-1',
  chatId: 'chat-1'
});

describe('sandbox runtime service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getSessionVolumeConfig.mockResolvedValue(undefined);

    mocks.upsertRunningSandboxInstance.mockResolvedValue({ sandboxId: 'sandbox-doc' });
    mocks.assertSandboxNotArchivedOrBusy.mockResolvedValue(undefined);
    mocks.restoreArchivedSandboxBeforeUse.mockResolvedValue(undefined);
    mocks.ensureConnectedSandboxRunning.mockResolvedValue(undefined);
    mocks.deleteSandboxResource.mockResolvedValue(undefined);
    mocks.stopSandboxResource.mockResolvedValue(undefined);
    mocks.buildRuntimeSandboxAdapter.mockReturnValue(createProvider());
    mocks.mongoAppFindById.mockReturnValue(mockLeanResult(null));
    mocks.mongoAgentSkillsFindById.mockReturnValue(mockLeanResult(null));
    mocks.checkTeamSandboxPermission.mockResolvedValue(undefined);
  });

  it('gets a sandbox client by stable sandbox id and ensures it is available', async () => {
    const client = await getSandboxClient(createSandboxIdQuery('sandbox-ready-check'));

    expect(client.getSandboxId()).toBe('sandbox-ready-check');
    expect(mocks.getSessionVolumeConfig).not.toHaveBeenCalled();
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
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app-1',
        metadata: {
          volumeEnabled: false
        }
      })
    );
    expect(mocks.ensureConnectedSandboxRunning).toHaveBeenCalledTimes(1);
  });

  it('prepares FastGPT volume only for OpenSandbox runtime', async () => {
    const vmConfig = {
      volumes: [{ name: 'workspace', pvc: { claimName: 'claim-1' }, mountPath: '/workspace' }],
      storage: { mountPath: '/workspace' }
    };
    mocks.getSessionVolumeConfig.mockResolvedValue(vmConfig);

    await getSandboxClient(createSandboxIdQuery('opensandbox-volume'), {
      providerName: 'opensandbox'
    });

    expect(mocks.getSessionVolumeConfig).toHaveBeenCalledWith('opensandbox-volume');
    expect(mocks.getSessionVolumeConfig).toHaveBeenCalledTimes(1);
    expect(mocks.restoreArchivedSandboxBeforeUse).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'opensandbox',
        sandboxId: 'opensandbox-volume',
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app-1',
        vmConfig,
        storage: { mountPath: '/workspace' }
      })
    );
    expect(mocks.assertSandboxNotArchivedOrBusy).not.toHaveBeenCalledWith({
      provider: 'opensandbox',
      sandboxId: 'opensandbox-volume'
    });
    expect(mocks.upsertRunningSandboxInstance).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'opensandbox',
        sandboxId: 'opensandbox-volume',
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app-1',
        storage: { mountPath: '/workspace' }
      })
    );
  });

  it('blocks archived sandbox when restore is disabled', async () => {
    mocks.assertSandboxNotArchivedOrBusy.mockRejectedValueOnce(new Error('Sandbox is archived'));

    await expect(
      getSandboxClient(createSandboxIdQuery('archived-sandbox'), { restoreArchived: false })
    ).rejects.toThrow('Sandbox is archived');
    expect(mocks.upsertRunningSandboxInstance).not.toHaveBeenCalled();
  });

  it('blocks archiving sandbox access before runtime can recreate it', async () => {
    mocks.restoreArchivedSandboxBeforeUse.mockRejectedValueOnce(new Error('Sandbox is archiving'));

    await expect(getSandboxClient(createSandboxIdQuery('archiving-sandbox'))).rejects.toThrow(
      'Sandbox is archiving'
    );
    expect(mocks.upsertRunningSandboxInstance).not.toHaveBeenCalled();
  });

  it('rejects legacy appId query instead of deriving sandbox id in runtime service', async () => {
    await expect(getSandboxClient({ appId: 'app-1', chatId: 'chat-1' } as any)).rejects.toThrow(
      'sandboxId is required'
    );
    expect(mocks.buildRuntimeSandboxAdapter).not.toHaveBeenCalled();
  });

  it('rejects sandboxId-only query before creating an orphan runtime record', async () => {
    await expect(getSandboxClient({ sandboxId: 'sandbox-without-source' } as any)).rejects.toThrow(
      'sourceType and sourceId are required'
    );
    expect(mocks.buildRuntimeSandboxAdapter).not.toHaveBeenCalled();
  });

  it('passes resource limits into running instance records and command timeout into exec', async () => {
    const provider = createProvider();
    mocks.buildRuntimeSandboxAdapter.mockReturnValueOnce(provider);
    const client = new SandboxClient(createSandboxIdQuery('sandbox-with-limits'), {
      resourceLimits: {
        cpuCount: 2,
        memoryMiB: 1024,
        diskGiB: 4
      },
      vmConfig: {
        volumes: [{ name: 'workspace', pvc: { claimName: 'claim-1' }, mountPath: '/workspace' }],
        storage: { mountPath: '/workspace' }
      }
    });

    await expect(client.exec('echo ok', 2)).resolves.toEqual({
      stdout: 'ok',
      stderr: '',
      exitCode: 0
    });
    expect(provider.execute).toHaveBeenCalledWith('echo ok', { timeoutMs: 2_000 });
    expect(mocks.upsertRunningSandboxInstance).toHaveBeenCalledWith(
      expect.objectContaining({
        sandboxId: 'sandbox-with-limits',
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app-1',
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
    const client = new SandboxClient(createSandboxIdQuery('runtime-cleanup-sandbox'));

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
    const client = new SandboxClient(createSandboxIdQuery('sandbox-ensure-fail'));

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
    const client = new SandboxClient(createSandboxIdQuery('sandbox-execute-fail'), {
      providerName: 'opensandbox',
      createConfig: {
        image: { repository: 'test-image' }
      }
    });

    await expect(client.exec('echo fail')).resolves.toMatchObject({
      stdout: '',
      stderr: expect.stringContaining('Failed to execute sandbox'),
      exitCode: -1
    });
  });
});
