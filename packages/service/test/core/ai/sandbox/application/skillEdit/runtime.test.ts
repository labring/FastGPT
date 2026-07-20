import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  mongoSkillFindOne: vi.fn(),
  mongoVersionFindOne: vi.fn(),
  validateDeployableSkillWorkspacePackage: vi.fn(),
  validateZipStructure: vi.fn(),
  connectToSandbox: vi.fn(),
  disconnectSandbox: vi.fn(),
  getReadySandboxInfo: vi.fn(),
  getSandboxClient: vi.fn(),
  getSandboxDurableSaga: vi.fn(),
  startSandboxRuntimeUpgradeArchive: vi.fn(),
  countRunningSandboxInstancesBySourceType: vi.fn(),
  findSandboxInstanceBySandboxId: vi.fn(),
  findSandboxInstanceBySandboxIdAndSource: vi.fn(),
  findSandboxResourcesBySourceExcludeProvider: vi.fn(),
  updateSandboxInstanceRecordBySandboxId: vi.fn(),
  checkTeamSandboxPermission: vi.fn(),
  prepareSandbox: vi.fn(),
  preparePackageMirrors: vi.fn(),
  prepareWorkDirectory: vi.fn(),
  emptyWorkDirectory: vi.fn(),
  downloadSkillPackageToContext: vi.fn(),
  deployDownloadedSkillPackage: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/skill/model/schema', () => ({
  MongoAgentSkills: { findOne: mocks.mongoSkillFindOne }
}));

vi.mock('@fastgpt/service/core/ai/skill/version/schema', () => ({
  MongoAgentSkillsVersion: { findOne: mocks.mongoVersionFindOne }
}));

vi.mock('@fastgpt/service/core/ai/skill/package', () => ({
  DEFAULT_GITIGNORE_CONTENT: '.venv/\nnode_modules/\n',
  validateDeployableSkillWorkspacePackage: mocks.validateDeployableSkillWorkspacePackage,
  validateZipStructure: mocks.validateZipStructure
}));

vi.mock('@fastgpt/service/core/ai/skill/edit/config', () => ({
  EDIT_DEBUG_SANDBOX_CHAT_ID: 'edit-debug',
  getEditDebugSandboxId: (skillId: string) => `edit-debug-${skillId}`
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/provider/config', () => ({
  getSandboxProviderConfig: () => ({ provider: 'opensandbox' }),
  validateSandboxConfig: vi.fn(),
  getSandboxAdapterConfig: vi.fn(({ createConfig }) => ({
    providerConfig: { provider: 'opensandbox' },
    createConfig: {
      image: { repository: 'runtime-image', tag: 'v2' },
      ...createConfig
    }
  }))
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/provider/runtimeProfile', () => ({
  getSandboxRuntimeProfile: () => ({
    provider: 'opensandbox',
    workDirectory: '/workspace',
    skillsRootPath: '/workspace/skills'
  })
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/provider/lifecycle', () => ({
  connectToSandbox: mocks.connectToSandbox,
  disconnectSandbox: mocks.disconnectSandbox,
  getReadySandboxInfo: mocks.getReadySandboxInfo
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/runtime/client', () => ({
  getSandboxClient: mocks.getSandboxClient
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/lifecycle/service', () => ({
  getSandboxDurableSaga: mocks.getSandboxDurableSaga
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/archive', () => {
  class SandboxLifecycleStateError extends Error {
    constructor(readonly state: string) {
      super(`Sandbox is ${state}`);
      this.name = 'SandboxLifecycleStateError';
    }
  }
  return {
    SANDBOX_STALE_ARCHIVING_MINUTES: 15,
    SandboxLifecycleStateError,
    startSandboxRuntimeUpgradeArchive: mocks.startSandboxRuntimeUpgradeArchive
  };
});

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/instance/repository', () => ({
  countRunningSandboxInstancesBySourceType: mocks.countRunningSandboxInstancesBySourceType,
  findSandboxInstanceBySandboxId: mocks.findSandboxInstanceBySandboxId,
  findSandboxInstanceBySandboxIdAndSource: mocks.findSandboxInstanceBySandboxIdAndSource,
  findSandboxResourcesBySourceExcludeProvider: mocks.findSandboxResourcesBySourceExcludeProvider,
  updateSandboxInstanceRecordBySandboxId: mocks.updateSandboxInstanceRecordBySandboxId
}));

vi.mock('@fastgpt/service/common/logger', () => ({
  getLogger: () => mocks.logger,
  LogCategories: { MODULE: { AI: { AGENT: 'agent' } } }
}));

vi.mock('@fastgpt/service/support/permission/teamLimit', () => ({
  checkTeamSandboxPermission: mocks.checkTeamSandboxPermission
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/runtime/prepare', () => ({
  prepareSandbox: mocks.prepareSandbox,
  preparePackageMirrors: mocks.preparePackageMirrors,
  prepareWorkDirectory: mocks.prepareWorkDirectory,
  emptyWorkDirectory: mocks.emptyWorkDirectory
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/runtime/skill/prepare', () => ({
  downloadSkillPackageToContext: mocks.downloadSkillPackageToContext,
  deployDownloadedSkillPackage: mocks.deployDownloadedSkillPackage
}));

vi.mock('@fastgpt/service/env', () => ({
  serviceEnv: {
    AGENT_SANDBOX_DISK_MB: 2,
    AGENT_SANDBOX_MAX_EDIT_DEBUG: undefined
  }
}));

import {
  getRunningSkillEditSandbox,
  getSkillEditRuntimeContext,
  getSkillEditRuntimeStatus,
  initSkillEditRuntimeSandbox,
  packageSkillInSandbox,
  triggerSkillEditRuntimeUpgrade,
  type SkillEditRuntimeContext
} from '@fastgpt/service/core/ai/sandbox/application/skillEdit/runtime';

const createResource = (status = 'running', overrides: Record<string, unknown> = {}) =>
  ({
    _id: 'instance-1',
    provider: 'opensandbox',
    sandboxId: 'edit-debug-skill-1',
    sourceType: ChatSourceTypeEnum.skillEdit,
    sourceId: 'skill-1',
    status,
    lastActiveAt: new Date(),
    metadata: {
      image: { repository: 'runtime-image', tag: 'v2' },
      versionId: 'version-1'
    },
    ...overrides
  }) as any;

const createContext = (
  params: {
    existingInstance?: any;
    statusInstance?: any;
    staleProviderInstances?: any[];
  } = {}
): SkillEditRuntimeContext =>
  ({
    skillId: 'skill-1',
    teamId: 'team-1',
    tmbId: 'tmb-1',
    providerConfig: { provider: 'opensandbox' },
    runtimeProfile: {
      provider: 'opensandbox',
      workDirectory: '/workspace',
      skillsRootPath: '/workspace/skills'
    },
    createConfig: { image: { repository: 'runtime-image', tag: 'v2' } },
    runtimeImage: { repository: 'runtime-image', tag: 'v2' },
    skill: { _id: 'skill-1', name: 'Test skill', currentVersionId: 'version-1' },
    currentVersion: { _id: 'version-1', skillId: 'skill-1', storageKey: 'storage-key' },
    sessionId: 'edit-debug-skill-1',
    targetVersionId: 'version-1',
    existingInstance: params.statusInstance ?? params.existingInstance ?? null,
    staleProviderInstances: params.staleProviderInstances ?? []
  }) as any;

const createPackageSandbox = (readResult?: { content: Uint8Array; error: Error | null }) => ({
  execute: vi.fn(async (command: string) => {
    if (command === 'printf "%s" "$HOME"') {
      return { stdout: '/home/sandbox', stderr: '', exitCode: 0 };
    }
    if (command.includes("awk '{s+=$7}")) {
      return { stdout: '12', stderr: '', exitCode: 0 };
    }
    return { stdout: '', stderr: '', exitCode: 0 };
  }),
  readFiles: vi.fn(async (paths: string[]) => {
    if (paths[0]?.endsWith('.gitignore')) return [];
    return [
      {
        path: paths[0],
        content: readResult?.content ?? new Uint8Array([1, 2, 3]),
        error: readResult?.error ?? null
      }
    ];
  })
});

describe('packageSkillInSandbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validateDeployableSkillWorkspacePackage.mockResolvedValue({ valid: true, files: [] });
    mocks.validateZipStructure.mockResolvedValue({ valid: true, hasSkillMd: true, files: [] });
    mocks.disconnectSandbox.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('packages, validates and removes the temporary zip', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-17T00:00:00.000Z'));
    const sandbox = createPackageSandbox();
    mocks.connectToSandbox.mockResolvedValueOnce(sandbox);

    await expect(packageSkillInSandbox({ sandboxId: 'sandbox-1' })).resolves.toEqual(
      Buffer.from([1, 2, 3])
    );

    expect(mocks.validateDeployableSkillWorkspacePackage).toHaveBeenCalledWith(
      Buffer.from([1, 2, 3]),
      expect.any(Object)
    );
    expect(sandbox.execute).toHaveBeenCalledWith(
      expect.stringMatching(/^rm -f '\/home\/sandbox\/\.fastgpt\/tmp\/skill-package-/)
    );
    expect(mocks.disconnectSandbox).toHaveBeenCalledWith(sandbox);
  });

  it('uses basic zip validation for export', async () => {
    const sandbox = createPackageSandbox();
    mocks.connectToSandbox.mockResolvedValueOnce(sandbox);

    await packageSkillInSandbox({ sandboxId: 'sandbox-1', validationMode: 'basicZip' });

    expect(mocks.validateZipStructure).toHaveBeenCalledTimes(1);
    expect(mocks.validateDeployableSkillWorkspacePackage).not.toHaveBeenCalled();
  });

  it('propagates read failures and still disconnects', async () => {
    const sandbox = createPackageSandbox({
      content: new Uint8Array(),
      error: new Error('read failed')
    });
    mocks.connectToSandbox.mockResolvedValueOnce(sandbox);

    await expect(packageSkillInSandbox({ sandboxId: 'sandbox-1' })).rejects.toThrow('read failed');
    expect(mocks.disconnectSandbox).toHaveBeenCalledWith(sandbox);
  });
});

describe('skill edit runtime status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSandboxDurableSaga.mockResolvedValue({ status: 'waiting' });
  });

  it('reports ready for a matching stable runtime and upgradeRequired for an outdated image', async () => {
    await expect(
      getSkillEditRuntimeStatus({ context: createContext({ existingInstance: createResource() }) })
    ).resolves.toMatchObject({ status: 'readyToInit', shouldInit: true });

    await expect(
      getSkillEditRuntimeStatus({
        context: createContext({
          existingInstance: createResource('running', {
            metadata: { image: { repository: 'old-image', tag: 'v1' }, versionId: 'version-1' }
          })
        })
      })
    ).resolves.toMatchObject({ status: 'upgradeRequired', canUpgrade: true });
  });

  it('reads archiving failures from the active Saga snapshot', async () => {
    const archiving = createResource('archiving', {
      metadata: {
        activeSaga: { sagaId: 'archive-1', type: 'archive' }
      }
    });
    await expect(
      getSkillEditRuntimeStatus({
        context: createContext({ statusInstance: archiving })
      })
    ).resolves.toMatchObject({ status: 'upgrading', archiveState: 'archiving' });
    expect(mocks.getSandboxDurableSaga).toHaveBeenCalledWith('archive-1');

    mocks.getSandboxDurableSaga.mockResolvedValueOnce({
      status: 'blocked',
      lastError: { message: 'upload failed' }
    });
    await expect(
      getSkillEditRuntimeStatus({
        context: createContext({ statusInstance: archiving })
      })
    ).resolves.toMatchObject({
      status: 'upgradeRequired',
      archiveState: 'failed',
      lastError: 'upload failed'
    });
  });

  it('reports archived as ready and blocked restore from the Saga snapshot', async () => {
    await expect(
      getSkillEditRuntimeStatus({
        context: createContext({ statusInstance: createResource('archived') })
      })
    ).resolves.toMatchObject({ status: 'readyToInit', archiveState: 'archived' });

    const restoring = createResource('restoring', {
      metadata: {
        activeSaga: { sagaId: 'restore-1', type: 'restore' }
      }
    });
    mocks.getSandboxDurableSaga.mockResolvedValueOnce({
      status: 'blocked',
      lastError: { message: 'worker stopped' }
    });
    await expect(
      getSkillEditRuntimeStatus({
        context: createContext({ statusInstance: restoring })
      })
    ).resolves.toMatchObject({
      status: 'upgradeRequired',
      archiveState: 'restoring',
      lastError: 'worker stopped',
      shouldPoll: false,
      canUpgrade: false
    });
  });

  it('keeps a non-terminal restore Saga in polling state', async () => {
    const restoring = createResource('restoring', {
      metadata: {
        activeSaga: { sagaId: 'restore-1', type: 'restore' }
      }
    });

    await expect(
      getSkillEditRuntimeStatus({
        context: createContext({ statusInstance: restoring })
      })
    ).resolves.toMatchObject({ status: 'upgrading', archiveState: 'restoring', shouldPoll: true });
  });

  it('starts archive only for an upgradeable stable runtime', async () => {
    const outdated = createResource('running', {
      metadata: { image: { repository: 'old-image', tag: 'v1' }, versionId: 'version-1' }
    });
    mocks.startSandboxRuntimeUpgradeArchive.mockResolvedValueOnce({
      success: true,
      archivingDoc: createResource('archiving')
    });

    await expect(
      triggerSkillEditRuntimeUpgrade({
        context: createContext({ existingInstance: outdated })
      })
    ).resolves.toMatchObject({ status: 'upgrading', archiveState: 'archiving' });
    expect(mocks.startSandboxRuntimeUpgradeArchive).toHaveBeenCalledWith(outdated);
  });
});

describe('skill edit runtime initialization', () => {
  const provider = { status: { state: 'Running' } };
  const client = { provider, delete: vi.fn(async () => undefined) };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSandboxClient.mockResolvedValue(client);
    mocks.getReadySandboxInfo.mockResolvedValue(undefined);
    mocks.prepareSandbox.mockResolvedValue(undefined);
    mocks.preparePackageMirrors.mockReturnValue({ step: 'mirrors' });
    mocks.prepareWorkDirectory.mockReturnValue({ step: 'workdir' });
    mocks.emptyWorkDirectory.mockReturnValue({ step: 'empty' });
    mocks.downloadSkillPackageToContext.mockReturnValue({ step: 'download' });
    mocks.deployDownloadedSkillPackage.mockReturnValue({ step: 'deploy' });
    mocks.updateSandboxInstanceRecordBySandboxId.mockResolvedValue(createResource());
    mocks.countRunningSandboxInstancesBySourceType.mockResolvedValue(0);
    mocks.disconnectSandbox.mockResolvedValue(undefined);
  });

  it('routes stopped runtime activation through the shared runtime client', async () => {
    const stopped = createResource('stopped');

    await initSkillEditRuntimeSandbox({
      context: createContext({ existingInstance: stopped })
    });

    expect(mocks.getSandboxClient).toHaveBeenCalledWith(
      {
        sandboxId: 'edit-debug-skill-1',
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: 'skill-1',
        userId: ChatSourceTypeEnum.skillEdit,
        chatId: 'edit-debug'
      },
      expect.objectContaining({ createConfig: expect.any(Object) })
    );
    expect(mocks.prepareSandbox).toHaveBeenCalledWith(
      expect.objectContaining({ sandbox: provider, workDirectory: '/workspace' }),
      { step: 'mirrors' },
      { step: 'workdir' }
    );
    expect(mocks.updateSandboxInstanceRecordBySandboxId).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: ChatSourceTypeEnum.skillEdit,
        touchActive: true
      })
    );
  });

  it('deploys the target package after runtime client restores an outdated record', async () => {
    const archived = createResource('archived', {
      metadata: { image: { repository: 'old-image', tag: 'v1' }, versionId: 'old-version' }
    });

    await initSkillEditRuntimeSandbox({
      context: createContext({ statusInstance: archived })
    });

    expect(mocks.updateSandboxInstanceRecordBySandboxId).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ versionId: 'version-1', teamId: 'team-1' })
      })
    );
  });

  it('maps lifecycle transition contention to the runtime-upgrade user error', async () => {
    const { SandboxLifecycleStateError } =
      await import('@fastgpt/service/core/ai/sandbox/application/archive');
    mocks.getSandboxClient.mockRejectedValueOnce(new SandboxLifecycleStateError('archiving'));

    await expect(initSkillEditRuntimeSandbox({ context: createContext() })).rejects.toMatchObject({
      message: 'runtimeUpgradeInProgress'
    });
    expect(mocks.updateSandboxInstanceRecordBySandboxId).not.toHaveBeenCalled();
  });

  it('deletes only a newly created runtime when package preparation fails', async () => {
    mocks.prepareSandbox.mockRejectedValueOnce(new Error('deploy failed'));

    await expect(initSkillEditRuntimeSandbox({ context: createContext() })).rejects.toThrow(
      'deploy failed'
    );
    expect(client.delete).toHaveBeenCalledWith();

    client.delete.mockClear();
    mocks.prepareSandbox.mockRejectedValueOnce(new Error('deploy failed'));
    await expect(
      initSkillEditRuntimeSandbox({
        context: createContext({ existingInstance: createResource('running') })
      })
    ).rejects.toThrow('deploy failed');
    expect(client.delete).not.toHaveBeenCalled();
  });
});

describe('skill edit runtime context and read-only query', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkTeamSandboxPermission.mockResolvedValue(undefined);
    mocks.mongoSkillFindOne.mockResolvedValue({
      _id: 'skill-1',
      name: 'Test skill',
      currentVersionId: 'version-1'
    });
    mocks.mongoVersionFindOne.mockResolvedValue({
      _id: 'version-1',
      skillId: 'skill-1',
      storageKey: 'storage-key'
    });
    mocks.findSandboxInstanceBySandboxId.mockResolvedValue(null);
    mocks.findSandboxResourcesBySourceExcludeProvider.mockResolvedValue([]);
  });

  it('checks permission before reading skill runtime context', async () => {
    mocks.checkTeamSandboxPermission.mockRejectedValueOnce(new Error('denied'));

    await expect(
      getSkillEditRuntimeContext({ skillId: 'skill-1', teamId: 'team-1', tmbId: 'tmb-1' })
    ).rejects.toThrow();
    expect(mocks.mongoSkillFindOne).not.toHaveBeenCalled();
  });

  it('returns only a running sandbox owned by the requested team', async () => {
    mocks.findSandboxInstanceBySandboxIdAndSource.mockResolvedValueOnce(
      createResource('running', { metadata: { teamId: 'team-1' } })
    );

    await expect(
      getRunningSkillEditSandbox({ skillId: 'skill-1', teamId: 'team-1' })
    ).resolves.toMatchObject({ sandboxId: 'edit-debug-skill-1' });

    mocks.findSandboxInstanceBySandboxIdAndSource.mockResolvedValueOnce(
      createResource('running', { metadata: { teamId: 'other-team' } })
    );
    await expect(
      getRunningSkillEditSandbox({ skillId: 'skill-1', teamId: 'team-1' })
    ).resolves.toBeUndefined();
  });
});
