import JSZip from 'jszip';
import { UserError } from '@fastgpt/global/common/error/utils';
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

const createSkillMd = (name: string) => `---\nname: ${name}\ndescription: ${name}\n---\n`;

const buildZipBuffer = async (files: Record<string, string>) => {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) {
    zip.file(path, content);
  }
  return new Uint8Array(await zip.generateAsync({ type: 'uint8array' }));
};

const createPackageSandbox = (
  options: {
    readResult?: { content: Uint8Array; error: Error | null };
    findResult?: { stdout?: string; stderr?: string; exitCode?: number };
    findOutput?: string;
    workspaceFiles?: Record<string, string>;
    workspaceFileErrors?: Record<string, Error>;
    workspaceFileSizes?: Record<string, number>;
    zippedFiles?: Record<string, string>;
  } = {}
) => ({
  execute: vi.fn(async (command: string) => {
    if (command === 'printf "%s" "$HOME"') {
      return { stdout: '/home/sandbox', stderr: '', exitCode: 0 };
    }
    if (command.includes("awk '{s+=$7}")) {
      return { stdout: '12', stderr: '', exitCode: 0 };
    }
    if (command.includes('-print0')) {
      return {
        stdout: options.findResult?.stdout ?? options.findOutput ?? '',
        stderr: options.findResult?.stderr ?? '',
        exitCode: options.findResult?.exitCode ?? 0
      };
    }
    return { stdout: '', stderr: '', exitCode: 0 };
  }),
  getFileInfo: vi.fn(
    async (paths: string[]) =>
      new Map(
        paths.map((path) => [
          path,
          path.endsWith('/SKILL.md')
            ? {
                path,
                isDirectory: false,
                isFile: true,
                size:
                  options.workspaceFileSizes?.[path] ??
                  Buffer.byteLength(options.workspaceFiles?.[path] ?? '')
              }
            : { path, isDirectory: true, isFile: false }
        ])
      )
  ),
  createDirectories: vi.fn(async () => undefined),
  deleteFiles: vi.fn(async (paths: string[]) =>
    paths.map((path) => ({ path, success: true, error: null }))
  ),
  readFiles: vi.fn(async (paths: string[]) => {
    if (paths.length === 1 && paths[0]?.endsWith('.zip')) {
      return [
        {
          path: paths[0],
          content: options.zippedFiles
            ? await buildZipBuffer(options.zippedFiles)
            : (options.readResult?.content ?? new Uint8Array([1, 2, 3])),
          error: options.readResult?.error ?? null
        }
      ];
    }
    return paths.map((path) => ({
      path,
      content: options.workspaceFiles?.[path] ?? '',
      error: options.workspaceFileErrors?.[path] ?? null
    }));
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

  it('uses basic zip validation for export and ignores entry scan failures', async () => {
    const sandbox = createPackageSandbox({
      findOutput: './dist/SKILL.md\0',
      findResult: { stdout: '', stderr: 'permission denied', exitCode: 2 }
    });
    mocks.connectToSandbox.mockResolvedValueOnce(sandbox);

    await expect(
      packageSkillInSandbox({ sandboxId: 'sandbox-1', validationMode: 'basicZip' })
    ).resolves.toBeInstanceOf(Buffer);

    expect(sandbox.execute).not.toHaveBeenCalledWith(
      expect.stringContaining('-print0'),
      expect.anything()
    );
    expect(mocks.validateZipStructure).toHaveBeenCalledTimes(1);
    expect(mocks.validateDeployableSkillWorkspacePackage).not.toHaveBeenCalled();
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
      errorCode: 'missingSkillMd'
    });

    await expect(packageSkillInSandbox({ sandboxId: 'sandbox-1' })).rejects.toThrow(
      'missingSkillMd'
    );
    expect(mocks.logger.error).not.toHaveBeenCalled();
    expect(mocks.disconnectSandbox).toHaveBeenCalledWith(sandbox);
  });

  it('rejects when packaging excludes drop valid SKILL.md entries', async () => {
    const sandbox = createPackageSandbox({
      findOutput: './writer/SKILL.md\0./dist/SKILL.md\0',
      workspaceFiles: {
        '/workspace/writer/SKILL.md': createSkillMd('writer'),
        '/workspace/dist/SKILL.md': createSkillMd('dist')
      },
      zippedFiles: { 'writer/SKILL.md': createSkillMd('writer') }
    });
    mocks.connectToSandbox.mockResolvedValueOnce(sandbox);

    const error = await packageSkillInSandbox({ sandboxId: 'sandbox-1' }).catch((err) => err);

    expect(error).toBeInstanceOf(UserError);
    expect(error.message).toBe('invalidSkillPackage');
    expect(error.cause?.message).toContain('dist/SKILL.md');
  });

  it('rejects SKILL.md entry paths with control characters', async () => {
    const sandbox = createPackageSandbox({
      findOutput: './bad\nname/SKILL.md\0',
      workspaceFiles: { '/workspace/bad\nname/SKILL.md': createSkillMd('bad') },
      zippedFiles: { 'bad\nname/SKILL.md': createSkillMd('bad') }
    });
    mocks.connectToSandbox.mockResolvedValueOnce(sandbox);

    const error = await packageSkillInSandbox({ sandboxId: 'sandbox-1' }).catch((err) => err);

    expect(error).toBeInstanceOf(UserError);
    expect(error.message).toBe('invalidSkillPackage');
    expect(error.cause?.message).toContain('Unsupported SKILL.md path with control characters');
  });

  it('keeps leading spaces in SKILL.md entry paths without false positives', async () => {
    const sandbox = createPackageSandbox({
      findOutput: './ Notes/SKILL.md\0',
      workspaceFiles: { '/workspace/ Notes/SKILL.md': createSkillMd('notes') },
      zippedFiles: { ' Notes/SKILL.md': createSkillMd('notes') }
    });
    mocks.connectToSandbox.mockResolvedValueOnce(sandbox);

    await expect(packageSkillInSandbox({ sandboxId: 'sandbox-1' })).resolves.toBeInstanceOf(Buffer);
  });

  it('passes when every valid SKILL.md entry is packaged', async () => {
    const sandbox = createPackageSandbox({
      findOutput: './writer/SKILL.md\0./nested/deep/SKILL.md\0',
      workspaceFiles: {
        '/workspace/writer/SKILL.md': createSkillMd('writer'),
        '/workspace/nested/deep/SKILL.md': createSkillMd('deep')
      },
      zippedFiles: {
        'writer/SKILL.md': createSkillMd('writer'),
        'nested/deep/SKILL.md': createSkillMd('deep')
      }
    });
    mocks.connectToSandbox.mockResolvedValueOnce(sandbox);

    await expect(packageSkillInSandbox({ sandboxId: 'sandbox-1' })).resolves.toBeInstanceOf(Buffer);
    expect(mocks.validateDeployableSkillWorkspacePackage).toHaveBeenCalledTimes(1);
  });

  it('fails publish when the workspace entry scan exits non-zero', async () => {
    const sandbox = createPackageSandbox({
      findResult: { stdout: 'partial', stderr: 'permission denied', exitCode: 2 }
    });
    mocks.connectToSandbox.mockResolvedValueOnce(sandbox);

    const error = await packageSkillInSandbox({ sandboxId: 'sandbox-1' }).catch((err) => err);

    expect(error).toBeInstanceOf(UserError);
    expect(error.message).toBe('invalidSkillPackage');
    expect(error.cause?.message).toContain('permission denied');
    expect(sandbox.execute).not.toHaveBeenCalledWith(
      expect.stringMatching(/^zip -r -y /),
      expect.anything()
    );
    expect(mocks.validateDeployableSkillWorkspacePackage).not.toHaveBeenCalled();
  });

  it('fails publish when a candidate SKILL.md cannot be read', async () => {
    const sandbox = createPackageSandbox({
      findOutput: './writer/SKILL.md\0./dist/SKILL.md\0',
      workspaceFiles: {
        '/workspace/writer/SKILL.md': createSkillMd('writer'),
        '/workspace/dist/SKILL.md': createSkillMd('dist')
      },
      workspaceFileErrors: { '/workspace/dist/SKILL.md': new Error('transport reset') }
    });
    mocks.connectToSandbox.mockResolvedValueOnce(sandbox);

    const error = await packageSkillInSandbox({ sandboxId: 'sandbox-1' }).catch((err) => err);

    expect(error).toBeInstanceOf(UserError);
    expect(error.message).toBe('invalidSkillPackage');
    expect(error.cause?.message).toContain('/workspace/dist/SKILL.md');
    expect(error.cause?.message).toContain('transport reset');
    expect(sandbox.execute).not.toHaveBeenCalledWith(
      expect.stringMatching(/^zip -r -y /),
      expect.anything()
    );
  });

  it('enforces the per-file read budget before reading candidate entries', async () => {
    const sandbox = createPackageSandbox({
      findOutput: './writer/SKILL.md\0',
      workspaceFileSizes: { '/workspace/writer/SKILL.md': 300 * 1024 }
    });
    mocks.connectToSandbox.mockResolvedValueOnce(sandbox);

    const error = await packageSkillInSandbox({ sandboxId: 'sandbox-1' }).catch((err) => err);

    expect(error).toBeInstanceOf(UserError);
    expect(error.message).toBe('archiveTooLarge');
    expect(error.cause?.message).toContain('/workspace/writer/SKILL.md');
    expect(error.cause?.message).toContain('per-file read limit');
    expect(sandbox.readFiles).not.toHaveBeenCalledWith(
      expect.arrayContaining([expect.stringMatching(/SKILL\.md$/)])
    );
  });

  it('enforces the cumulative read budget before reading candidate entries', async () => {
    const entries = Array.from({ length: 5 }, (_, index) => `./skill-${index}/SKILL.md`);
    const sandbox = createPackageSandbox({
      findOutput: entries.map((entry) => `${entry}\0`).join(''),
      workspaceFileSizes: Object.fromEntries(
        entries.map((entry) => [`/workspace/${entry.slice(2)}`, 250 * 1024])
      )
    });
    mocks.connectToSandbox.mockResolvedValueOnce(sandbox);

    const error = await packageSkillInSandbox({ sandboxId: 'sandbox-1' }).catch((err) => err);

    expect(error).toBeInstanceOf(UserError);
    expect(error.message).toBe('archiveTooLarge');
    expect(error.cause?.message).toContain('total read limit');
    expect(error.cause?.message).toContain('/workspace/skill-4/SKILL.md');
    expect(sandbox.readFiles).not.toHaveBeenCalledWith(
      expect.arrayContaining([expect.stringMatching(/SKILL\.md$/)])
    );
  });

  it('checks directory size before scanning and reading entries', async () => {
    const sandbox = createPackageSandbox({
      findOutput: './writer/SKILL.md\0',
      workspaceFiles: { '/workspace/writer/SKILL.md': createSkillMd('writer') },
      zippedFiles: { 'writer/SKILL.md': createSkillMd('writer') }
    });
    mocks.connectToSandbox.mockResolvedValueOnce(sandbox);

    await packageSkillInSandbox({ sandboxId: 'sandbox-1' });

    const sizeCheckIndex = sandbox.execute.mock.calls.findIndex(([command]) =>
      command.includes("awk '{s+=$7}")
    );
    const findIndex = sandbox.execute.mock.calls.findIndex(([command]) =>
      command.includes('-print0')
    );
    const skillReadIndex = sandbox.readFiles.mock.calls.findIndex(([paths]) =>
      paths.some((path: string) => path.endsWith('/SKILL.md'))
    );
    const [sizeCheckOrder, findOrder] = [
      sandbox.execute.mock.invocationCallOrder[sizeCheckIndex],
      sandbox.execute.mock.invocationCallOrder[findIndex]
    ];
    const skillReadOrder = sandbox.readFiles.mock.invocationCallOrder[skillReadIndex];
    const firstReadOrder = sandbox.readFiles.mock.invocationCallOrder[0];

    expect(skillReadIndex).toBeGreaterThanOrEqual(0);
    expect(sizeCheckOrder).toBeLessThan(findOrder);
    expect(sizeCheckOrder).toBeLessThan(firstReadOrder);
    expect(sizeCheckOrder).toBeLessThan(skillReadOrder);
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
