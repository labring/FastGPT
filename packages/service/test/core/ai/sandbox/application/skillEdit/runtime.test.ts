import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import { UserError } from '@fastgpt/global/common/error/utils';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  mongoSkillFindOne: vi.fn(),
  mongoVersionFindOne: vi.fn(),
  validateDeployableSkillWorkspacePackage: vi.fn(),
  validateZipPackageSafety: vi.fn(),
  connectToSandbox: vi.fn(),
  disconnectSandbox: vi.fn(),
  getReadySandboxInfo: vi.fn(),
  getSandboxClient: vi.fn(),
  startSandboxRuntimeUpgradeArchive: vi.fn(),
  findSandboxInstanceBySandboxIdAndSource: vi.fn(),
  findSandboxResourcesBySource: vi.fn(),
  updateSandboxInstanceRecordBySandboxId: vi.fn(),
  checkTeamSandboxPermission: vi.fn(),
  prepareSandbox: vi.fn(),
  preparePackageMirrors: vi.fn(),
  prepareWorkDirectory: vi.fn(),
  emptyWorkDirectory: vi.fn(),
  deploySkillPackage: vi.fn()
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
  validateZipPackageSafety: mocks.validateZipPackageSafety
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

vi.mock('@fastgpt/service/core/ai/sandbox/application/archive', () => {
  return {
    startSandboxRuntimeUpgradeArchive: mocks.startSandboxRuntimeUpgradeArchive
  };
});

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
    image: { repository: 'runtime-image', tag: 'v2' },
    versionId: 'version-1',
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
    providerConfig: { provider: 'opensandbox' },
    runtimeProfile: {
      provider: 'opensandbox',
      workDirectory: '/workspace',
      skillsRootPath: '/workspace/skills'
    },
    createConfig: { image: { repository: 'runtime-image', tag: 'v2' } },
    runtimeImage: { repository: 'runtime-image', tag: 'v2' },
    currentVersion: { _id: 'version-1', skillId: 'skill-1', storageKey: 'storage-key' },
    sessionId: 'edit-debug-skill-1',
    targetVersionId: 'version-1',
    runtimeUpgradeTarget: {
      sandboxId: 'edit-debug-skill-1',
      targetProvider: 'opensandbox',
      targetImage: { repository: 'runtime-image', tag: 'v2' },
      statusInstance: runtimeInstance,
      upgradeInstance: runtimeInstance
    }
  } as any;
};

const createPackageSandbox = (options?: {
  readResult?: { content: Uint8Array; error: Error | null };
  zipExecuteResult?: { stdout: string; stderr: string; exitCode: number };
}) => ({
  execute: vi.fn(async (command: string) => {
    if (command === 'printf "%s" "$HOME"') {
      return { stdout: '/home/sandbox', stderr: '', exitCode: 0 };
    }
    if (command.includes("awk '{s+=$7}")) {
      return { stdout: '12', stderr: '', exitCode: 0 };
    }
    return options?.zipExecuteResult ?? { stdout: '', stderr: '', exitCode: 0 };
  }),
  getFileInfo: vi.fn(
    async (paths: string[]) =>
      new Map(paths.map((path) => [path, { path, isDirectory: true, isFile: false }]))
  ),
  createDirectories: vi.fn(async () => undefined),
  deleteFiles: vi.fn(async (paths: string[]) =>
    paths.map((path) => ({ path, success: true, error: null }))
  ),
  readFiles: vi.fn(async (paths: string[]) => {
    if (paths[0]?.endsWith('.gitignore')) return [];
    return [
      {
        path: paths[0],
        content: options?.readResult?.content ?? new Uint8Array([1, 2, 3]),
        error: options?.readResult?.error ?? null
      }
    ];
  })
});

describe('packageSkillInSandbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validateDeployableSkillWorkspacePackage.mockResolvedValue({ valid: true, files: [] });
    mocks.validateZipPackageSafety.mockResolvedValue({ valid: true, files: [] });
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
    expect(sandbox.deleteFiles).toHaveBeenCalledWith([
      expect.stringMatching(/^\/home\/sandbox\/\.fastgpt\/tmp\/skill-package-/)
    ]);
    expect(sandbox.execute).toHaveBeenCalledWith(expect.stringContaining("awk '{s+=$7}"), {
      workingDirectory: '/workspace'
    });
    expect(sandbox.execute).toHaveBeenCalledWith(expect.stringMatching(/^zip -r -y /), {
      workingDirectory: '/workspace'
    });
    expect(mocks.disconnectSandbox).toHaveBeenCalledWith(sandbox);
  });

  it('uses basic zip safety validation and streams non-symlink entries to zip for full export', async () => {
    const sandbox = createPackageSandbox();
    mocks.connectToSandbox.mockResolvedValueOnce(sandbox);

    await expect(
      packageSkillInSandbox({
        sandboxId: 'sandbox-1',
        validationMode: 'basicZip',
        applyIgnoreRules: false
      })
    ).resolves.toEqual(Buffer.from([1, 2, 3]));

    expect(mocks.validateZipPackageSafety).toHaveBeenCalledWith(
      Buffer.from([1, 2, 3]),
      expect.any(Object)
    );
    expect(mocks.validateDeployableSkillWorkspacePackage).not.toHaveBeenCalled();
    expect(sandbox.readFiles).not.toHaveBeenCalledWith(['/workspace/.gitignore']);

    const executedCommands = sandbox.execute.mock.calls.map(([cmd]: [string]) => cmd);
    const sizeCheckCmd = executedCommands.find((cmd: string) => cmd.includes("awk '{s+=$7}"));
    const exportZipCmd = executedCommands.find((cmd: string) => cmd.includes('zip -q -y -@'));

    expect(executedCommands).toHaveLength(3);
    expect(sizeCheckCmd).toBeDefined();
    expect(sizeCheckCmd).not.toContain('-prune');
    expect(exportZipCmd).toContain('find . -type l -prune');
    expect(exportZipCmd).toContain("! -name 'package.zip'");
    expect(exportZipCmd).not.toContain('node_modules');
    expect(exportZipCmd).not.toContain('.venv');
    expect(sandbox.deleteFiles).toHaveBeenCalledWith([
      expect.stringMatching(/^\/home\/sandbox\/\.fastgpt\/tmp\/skill-package-.*\.zip$/)
    ]);
  });

  it('maps empty workspace exit code 12 to archiveEmpty without deleting non-created zip', async () => {
    const sandbox = createPackageSandbox({
      zipExecuteResult: { stdout: 'zip error: Nothing to do!', stderr: '', exitCode: 12 }
    });
    mocks.connectToSandbox.mockResolvedValueOnce(sandbox);

    const err = await packageSkillInSandbox({
      sandboxId: 'sandbox-1',
      validationMode: 'basicZip',
      applyIgnoreRules: false
    }).catch((error) => error);

    expect(err).toBeInstanceOf(UserError);
    expect(err.message).toBe(SkillErrEnum.archiveEmpty);
    expect(mocks.logger.error).not.toHaveBeenCalled();
    expect(sandbox.deleteFiles).not.toHaveBeenCalled();
  });

  it('maps control-character export path failures to invalidSkillPackage and silently cleans up zip', async () => {
    const sandbox = createPackageSandbox({
      zipExecuteResult: {
        stdout: '',
        stderr: 'Unsafe ZIP entry path contains control character\n',
        exitCode: 1
      }
    });
    sandbox.deleteFiles.mockResolvedValueOnce([
      { path: '/home/sandbox/.fastgpt/tmp/skill-package.zip', success: false, error: null }
    ]);
    mocks.connectToSandbox.mockResolvedValueOnce(sandbox);

    const err = await packageSkillInSandbox({
      sandboxId: 'sandbox-1',
      validationMode: 'basicZip',
      applyIgnoreRules: false
    }).catch((error) => error);

    expect(err).toBeInstanceOf(UserError);
    expect(err.message).toBe(SkillErrEnum.invalidSkillPackage);
    expect(mocks.logger.error).not.toHaveBeenCalled();
    expect(mocks.logger.warn).not.toHaveBeenCalled();
    expect(sandbox.deleteFiles).toHaveBeenCalledWith([
      expect.stringMatching(/^\/home\/sandbox\/\.fastgpt\/tmp\/skill-package-.*\.zip$/)
    ]);
  });

  it('cleans up the temp zip when export packaging or find fails', async () => {
    const sandbox = createPackageSandbox({
      zipExecuteResult: {
        stdout: '',
        stderr: "find: './secret': Permission denied",
        exitCode: 1
      }
    });
    mocks.connectToSandbox.mockResolvedValueOnce(sandbox);

    await expect(
      packageSkillInSandbox({ sandboxId: 'sandbox-1', applyIgnoreRules: false })
    ).rejects.toThrow("Failed to package skill directory: find: './secret': Permission denied");

    expect(sandbox.deleteFiles).toHaveBeenCalledWith([
      expect.stringMatching(/^\/home\/sandbox\/\.fastgpt\/tmp\/skill-package-.*\.zip$/)
    ]);
  });

  it('logs cleanup failure without masking the export result', async () => {
    const sandbox = createPackageSandbox();
    const cleanupError = new Error('delete zip failed');
    sandbox.deleteFiles.mockRejectedValueOnce(cleanupError);
    mocks.connectToSandbox.mockResolvedValueOnce(sandbox);

    await expect(
      packageSkillInSandbox({ sandboxId: 'sandbox-1', applyIgnoreRules: false })
    ).resolves.toEqual(Buffer.from([1, 2, 3]));

    expect(mocks.logger.warn).toHaveBeenCalledTimes(1);
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      '[Sandbox] Failed to cleanup package zip',
      expect.objectContaining({
        sandboxId: 'sandbox-1',
        zipFilePath: expect.stringMatching(
          /^\/home\/sandbox\/\.fastgpt\/tmp\/skill-package-.*\.zip$/
        ),
        error: cleanupError
      })
    );
  });

  it('applies default and root .gitignore rules during publish packaging', async () => {
    const sandbox = createPackageSandbox();
    sandbox.readFiles.mockImplementation(async (paths: string[]) => {
      if (paths[0] === '/workspace/.gitignore') {
        return [{ path: paths[0], content: 'drafts/\n', error: null }];
      }
      return [{ path: paths[0], content: new Uint8Array([1, 2, 3]), error: null }];
    });
    mocks.connectToSandbox.mockResolvedValueOnce(sandbox);

    await packageSkillInSandbox({ sandboxId: 'sandbox-1' });

    expect(sandbox.readFiles).toHaveBeenCalledWith(['/workspace/.gitignore']);
    const executedCommands = sandbox.execute.mock.calls.map(([cmd]: [string]) => cmd);
    const sizeCheckCmd = executedCommands.find((cmd: string) => cmd.includes("awk '{s+=$7}"));
    const zipCmd = executedCommands.find((cmd: string) => cmd.startsWith('zip -r -y '));

    expect(sizeCheckCmd).toContain('-prune');
    expect(sizeCheckCmd).toContain('drafts');
    expect(zipCmd).toContain('node_modules');
    expect(zipCmd).toContain('.venv');
    expect(zipCmd).toContain('drafts');
    expect(executedCommands.some((cmd: string) => cmd.includes('-type l'))).toBe(false);
    expect(sandbox.deleteFiles).toHaveBeenCalledWith([
      expect.stringMatching(/^\/home\/sandbox\/\.fastgpt\/tmp\/skill-package-/)
    ]);
  });

  it('propagates read failures and still disconnects', async () => {
    const sandbox = createPackageSandbox({
      readResult: {
        content: new Uint8Array(),
        error: new Error('read failed')
      }
    });
    mocks.connectToSandbox.mockResolvedValueOnce(sandbox);

    await expect(packageSkillInSandbox({ sandboxId: 'sandbox-1' })).rejects.toThrow('read failed');
    expect(mocks.disconnectSandbox).toHaveBeenCalledWith(sandbox);
  });

  it('throws structured SkillErrEnum errorCode when package validation fails', async () => {
    const sandbox = createPackageSandbox();
    mocks.connectToSandbox.mockResolvedValueOnce(sandbox);
    mocks.validateDeployableSkillWorkspacePackage.mockResolvedValueOnce({
      valid: false,
      files: [],
      error: 'Skill package must contain at least one SKILL.md',
      errorCode: SkillErrEnum.missingSkillMd
    });

    await expect(packageSkillInSandbox({ sandboxId: 'sandbox-1' })).rejects.toThrow(
      SkillErrEnum.missingSkillMd
    );
    expect(mocks.logger.error).not.toHaveBeenCalled();
    expect(mocks.disconnectSandbox).toHaveBeenCalledWith(sandbox);
  });
});

describe('skill edit runtime status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the shared runtime target for status checks and upgrades', async () => {
    await expect(
      getSkillEditRuntimeStatus({ context: createContext({ runtimeInstance: createResource() }) })
    ).resolves.toEqual({ status: 'readyToInit' });

    const outdated = createResource('running', {
      image: { repository: 'old-image', tag: 'v1' },
      versionId: 'version-1'
    });
    await expect(
      getSkillEditRuntimeStatus({
        context: createContext({ runtimeInstance: outdated })
      })
    ).resolves.toEqual({ status: 'upgradeRequired' });
    mocks.startSandboxRuntimeUpgradeArchive.mockResolvedValueOnce({
      success: true,
      archivingDoc: createResource('archiving')
    });

    await expect(
      triggerSkillEditRuntimeUpgrade({
        context: createContext({ runtimeInstance: outdated })
      })
    ).resolves.toEqual({ status: 'upgrading' });
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
    mocks.deploySkillPackage.mockReturnValue({ step: 'deploy' });
    mocks.updateSandboxInstanceRecordBySandboxId.mockResolvedValue(createResource());
    mocks.disconnectSandbox.mockResolvedValue(undefined);
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
      image: { repository: 'old-image', tag: 'v1' },
      versionId: 'old-version'
    });

    await initSkillEditRuntimeSandbox({
      context: createContext({ runtimeInstance: archived })
    });

    expect(mocks.updateSandboxInstanceRecordBySandboxId).toHaveBeenCalledWith(
      expect.objectContaining({
        versionId: 'version-1',
        teamId: 'team-1'
      })
    );
  });

  it('maps lifecycle transition contention to the runtime-upgrade user error', async () => {
    const { SandboxLifecycleStateError } =
      await import('@fastgpt/service/core/ai/sandbox/application/lifecycle/error');
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
        context: createContext({ runtimeInstance: createResource('running') })
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
