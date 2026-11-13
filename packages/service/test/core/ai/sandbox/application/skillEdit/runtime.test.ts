import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  mongoSkillFindOne: vi.fn(),
  mongoVersionFindOne: vi.fn(),
  validateDeployableSkillWorkspacePackage: vi.fn(),
  validateZipStructure: vi.fn(),
  createOpenSandboxResourceClient: vi.fn(),
  getSandboxClient: vi.fn(),
  findSandboxInstanceBySandboxIdAndSource: vi.fn(),
  findSandboxResourcesBySource: vi.fn(),
  updateSandboxInstanceRecordBySandboxId: vi.fn(),
  checkTeamSandboxPermission: vi.fn(),
  prepareSandbox: vi.fn(),
  preparePackageMirrors: vi.fn(),
  prepareWorkDirectory: vi.fn(),
  emptyWorkDirectory: vi.fn(),
  deploySkillPackage: vi.fn(),
  withAgentSandboxInitLease: vi.fn()
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

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox/config', () => ({
  getOpenSandboxClientConfig: () => ({ baseUrl: 'http://opensandbox.local', apiKey: 'key' }),
  getOpenSandboxRuntimeConfig: vi.fn(({ createConfig }) => ({
    clientConfig: { baseUrl: 'http://opensandbox.local', apiKey: 'key' },
    createConfig: {
      image: 'runtime-image:v2',
      ...createConfig
    }
  }))
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox/runtimeProfile', () => ({
  getSandboxRuntimeProfile: () => ({
    workDirectory: '/workspace',
    homeDirectory: '/home/sandbox'
  })
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox/opensandbox', () => ({
  createOpenSandboxResourceClient: mocks.createOpenSandboxResourceClient
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/runtime/client', () => ({
  getSandboxClient: mocks.getSandboxClient
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/instance/repository', () => ({
  findSandboxInstanceBySandboxIdAndSource: mocks.findSandboxInstanceBySandboxIdAndSource,
  findSandboxResourcesBySource: mocks.findSandboxResourcesBySource,
  updateSandboxInstanceRecordBySandboxId: mocks.updateSandboxInstanceRecordBySandboxId
}));

vi.mock('@fastgpt/service/common/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/common/logger')>()),
  getLogger: () => mocks.logger
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

vi.mock('@fastgpt/service/core/ai/sandbox/application/runtime/entrypoint', () => ({
  withAgentSandboxInitLease: mocks.withAgentSandboxInitLease
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/runtime/skill/prepare', () => ({
  deploySkillPackage: mocks.deploySkillPackage
}));

vi.mock('@fastgpt/service/env', () => ({
  serviceEnv: {
    AGENT_SANDBOX_STORAGE_SIZE_GI: 1
  }
}));

import {
  getRunningSkillEditSandbox,
  getSkillEditRuntimeContext,
  initSkillEditRuntimeSandbox,
  packageSkillInSandbox,
  type SkillEditRuntimeContext
} from '@fastgpt/service/core/ai/sandbox/application/skillEdit/runtime';

const createResource = (status = 'running', overrides: Record<string, unknown> = {}) =>
  ({
    _id: 'instance-1',
    provider: 'opensandbox',
    sandboxId: 'edit-debug-skill-1',
    sourceType: ChatSourceTypeEnum.skillEdit,
    sourceId: 'skill-1',
    teamId: 'team-1',
    status,
    ...(status === 'running' ? { instanceId: 'remote-edit-1' } : {}),
    lastActiveAt: new Date(),
    image: 'runtime-image:v2',
    context: {
      skillVersionId: 'version-1'
    },
    ...overrides
  }) as any;

const createContext = (
  params: {
    runtimeInstance?: any;
  } = {}
): SkillEditRuntimeContext => {
  const { runtimeInstance } = params;
  return {
    skillId: 'skill-1',
    teamId: 'team-1',
    runtimeProfile: {
      workDirectory: '/workspace',
      homeDirectory: '/home/sandbox'
    },
    createConfig: { image: 'runtime-image:v2' },
    runtimeImage: 'runtime-image:v2',
    currentVersion: { _id: 'version-1', skillId: 'skill-1', storageKey: 'storage-key' },
    sessionId: 'edit-debug-skill-1',
    targetVersionId: 'version-1',
    statusInstance: runtimeInstance ?? null
  } as any;
};

const createPackageSandbox = (readResult?: { content: Uint8Array; error: Error | null }) => ({
  connectRunning: vi.fn(async () => undefined),
  close: vi.fn(async () => undefined),
  execute: vi.fn(async (command: string) => {
    if (command.includes("awk '{s+=$7}")) {
      return { stdout: '12', stderr: '', exitCode: 0 };
    }
    return { stdout: '', stderr: '', exitCode: 0 };
  }),
  getFileInfo: vi.fn(
    async (paths: string[]) => new Map(paths.map((path) => [path, { path, type: 'directory' }]))
  ),
  createDirectories: vi.fn(async () => undefined),
  deleteFiles: vi.fn(async () => undefined),
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
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('packages, validates and removes the temporary zip', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-17T00:00:00.000Z'));
    const sandbox = createPackageSandbox();
    mocks.createOpenSandboxResourceClient.mockReturnValueOnce(sandbox);

    await expect(packageSkillInSandbox({ sandboxId: 'sandbox-1' })).resolves.toEqual(
      Buffer.from([1, 2, 3])
    );

    expect(mocks.validateDeployableSkillWorkspacePackage).toHaveBeenCalledWith(
      Buffer.from([1, 2, 3]),
      expect.any(Object)
    );
    expect(sandbox.deleteFiles).toHaveBeenCalledWith([
      expect.stringMatching(/^\/tmp\/fastgpt-skill-package-/)
    ]);
    expect(sandbox.execute).toHaveBeenCalledWith(expect.stringContaining("awk '{s+=$7}"), {
      workingDirectory: '/workspace'
    });
    expect(sandbox.execute).toHaveBeenCalledWith(expect.stringMatching(/^zip -r -y /), {
      workingDirectory: '/workspace'
    });
    expect(sandbox.close).toHaveBeenCalledTimes(1);
  });

  it('uses basic zip validation for export', async () => {
    const sandbox = createPackageSandbox();
    mocks.createOpenSandboxResourceClient.mockReturnValueOnce(sandbox);

    await packageSkillInSandbox({ sandboxId: 'sandbox-1', validationMode: 'basicZip' });

    expect(mocks.validateZipStructure).toHaveBeenCalledTimes(1);
    expect(mocks.validateDeployableSkillWorkspacePackage).not.toHaveBeenCalled();
  });

  it('propagates read failures and still disconnects', async () => {
    const sandbox = createPackageSandbox({
      content: new Uint8Array(),
      error: new Error('read failed')
    });
    mocks.createOpenSandboxResourceClient.mockReturnValueOnce(sandbox);

    await expect(packageSkillInSandbox({ sandboxId: 'sandbox-1' })).rejects.toThrow('read failed');
    expect(sandbox.close).toHaveBeenCalledTimes(1);
  });
});

describe('skill edit runtime initialization', () => {
  const opensandbox = { status: { state: 'Running' }, close: vi.fn(async () => undefined) };
  const client = {
    opensandbox,
    close: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined)
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withAgentSandboxInitLease.mockImplementation(
      async ({ fn }: { fn: () => Promise<unknown> }) => fn()
    );
    mocks.getSandboxClient.mockResolvedValue(client);
    mocks.prepareSandbox.mockResolvedValue(undefined);
    mocks.preparePackageMirrors.mockReturnValue({ step: 'mirrors' });
    mocks.prepareWorkDirectory.mockReturnValue({ step: 'workdir' });
    mocks.emptyWorkDirectory.mockReturnValue({ step: 'empty' });
    mocks.deploySkillPackage.mockReturnValue({ step: 'deploy' });
    mocks.updateSandboxInstanceRecordBySandboxId.mockResolvedValue(createResource());
  });

  it('routes stopped runtime activation through the shared runtime client', async () => {
    const stopped = createResource('stopped');

    await initSkillEditRuntimeSandbox({
      context: createContext({ runtimeInstance: stopped })
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
      expect.objectContaining({ sandbox: opensandbox, workDirectory: '/workspace' }),
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

  it('deploys the target package when the existing record has an older skillVersionId', async () => {
    const outdated = createResource('stopped', {
      image: 'old-image:v1',
      context: {
        skillVersionId: 'old-version'
      }
    });

    await initSkillEditRuntimeSandbox({
      context: createContext({ runtimeInstance: outdated })
    });

    expect(mocks.updateSandboxInstanceRecordBySandboxId).toHaveBeenCalledWith(
      expect.objectContaining({
        context: {
          skillVersionId: 'version-1'
        },
        teamId: 'team-1'
      })
    );
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
        context: createContext({ runtimeInstance: createResource('running') })
      })
    ).rejects.toThrow('deploy failed');
    expect(client.delete).not.toHaveBeenCalled();
  });

  it('serializes initialization under Init Lease and re-reads context.skillVersionId inside the lease to skip redundant unzip', async () => {
    // Stale context read outside lease had statusInstance = null, but inside Init Lease a preceding request already deployed version-1
    mocks.findSandboxInstanceBySandboxIdAndSource.mockResolvedValueOnce(
      createResource('running', { context: { skillVersionId: 'version-1' } })
    );

    await initSkillEditRuntimeSandbox({ context: createContext({ runtimeInstance: null }) });

    expect(mocks.withAgentSandboxInitLease).toHaveBeenCalledWith(
      expect.objectContaining({ sandboxId: 'edit-debug-skill-1' })
    );
    expect(mocks.emptyWorkDirectory).not.toHaveBeenCalled();
    expect(mocks.deploySkillPackage).not.toHaveBeenCalled();
    expect(mocks.prepareSandbox).toHaveBeenCalledWith(
      expect.objectContaining({ sandbox: opensandbox, workDirectory: '/workspace' }),
      { step: 'mirrors' },
      { step: 'workdir' }
    );
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
    mocks.findSandboxResourcesBySource.mockResolvedValue([]);
  });

  it('checks permission before reading skill runtime context', async () => {
    mocks.checkTeamSandboxPermission.mockRejectedValueOnce(new Error('denied'));

    await expect(
      getSkillEditRuntimeContext({ skillId: 'skill-1', teamId: 'team-1' })
    ).rejects.toThrow();
    expect(mocks.mongoSkillFindOne).not.toHaveBeenCalled();
  });

  it('returns only a running sandbox owned by the requested team', async () => {
    mocks.findSandboxInstanceBySandboxIdAndSource.mockResolvedValueOnce(
      createResource('running', { teamId: 'team-1' })
    );

    await expect(
      getRunningSkillEditSandbox({ skillId: 'skill-1', teamId: 'team-1' })
    ).resolves.toMatchObject({ sandboxId: 'edit-debug-skill-1' });

    mocks.findSandboxInstanceBySandboxIdAndSource.mockResolvedValueOnce(
      createResource('running', { teamId: 'other-team' })
    );
    await expect(
      getRunningSkillEditSandbox({ skillId: 'skill-1', teamId: 'team-1' })
    ).resolves.toBeUndefined();
  });
});
