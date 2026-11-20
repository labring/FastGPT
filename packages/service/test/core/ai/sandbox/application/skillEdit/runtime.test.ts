import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { normalizeArchiveListedEntryPath } from '@fastgpt/service/core/ai/skill/package/skillEntryScan';
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

const createPackageSandbox = (
  readResult?: { content: Uint8Array; error: Error | null },
  scanResult?: {
    findOutput?: string;
    unzipOutput?: string;
    scanExitCode?: number;
    scanStderr?: string;
  }
) => ({
  execute: vi.fn(async (command: string) => {
    if (command === 'printf "%s" "$HOME"') {
      return { stdout: '/home/sandbox', stderr: '', exitCode: 0 };
    }
    if (command.includes('-iname "SKILL.md"')) {
      return {
        stdout: scanResult?.findOutput ?? '',
        stderr: scanResult?.scanStderr ?? '',
        exitCode: scanResult?.scanExitCode ?? 0
      };
    }
    if (command.startsWith('unzip -Z1 ')) {
      return { stdout: scanResult?.unzipOutput ?? '', stderr: '', exitCode: 0 };
    }
    if (command.includes("awk '{s+=$7}")) {
      return { stdout: '12', stderr: '', exitCode: 0 };
    }
    return { stdout: '', stderr: '', exitCode: 0 };
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

  it('uses basic zip validation for export', async () => {
    const sandbox = createPackageSandbox();
    mocks.connectToSandbox.mockResolvedValueOnce(sandbox);

    await packageSkillInSandbox({ sandboxId: 'sandbox-1', validationMode: 'basicZip' });

    expect(mocks.validateZipStructure).toHaveBeenCalledTimes(1);
    expect(mocks.validateDeployableSkillWorkspacePackage).not.toHaveBeenCalled();
    expect(
      sandbox.execute.mock.calls.some(([command]) => String(command).includes('-iname "SKILL.md"'))
    ).toBe(false);
  });

  it('rejects packaging when exclusion rules drop a selected SKILL.md entry', async () => {
    const sandbox = createPackageSandbox(undefined, {
      findOutput: './src/SKILL.md\0./dist/SKILL.md\0',
      unzipOutput: './src/SKILL.md\n'
    });
    mocks.connectToSandbox.mockResolvedValueOnce(sandbox);

    await expect(packageSkillInSandbox({ sandboxId: 'sandbox-1' })).rejects.toThrow(
      'Skill package is missing SKILL.md entries excluded by packaging rules: dist/SKILL.md'
    );

    expect(mocks.validateDeployableSkillWorkspacePackage).not.toHaveBeenCalled();
    expect(sandbox.deleteFiles).toHaveBeenCalledWith([
      expect.stringMatching(/^\/home\/sandbox\/\.fastgpt\/tmp\/skill-package-/)
    ]);
    expect(mocks.disconnectSandbox).toHaveBeenCalledWith(sandbox);
  });

  it('does not treat a resource SKILL.md dropped by default excludes as a missing entry', async () => {
    // 标准包：skills/writer/SKILL.md 是入口，dist/ 下的无 frontmatter 示例是资源，
    // 默认排除规则把它移出产物是预期行为，不能因此拒绝发布。
    const sandbox = createPackageSandbox(undefined, {
      findOutput: './skills/writer/SKILL.md\0./skills/writer/dist/examples/SKILL.md\0',
      unzipOutput: './skills/writer/SKILL.md\n'
    });
    mocks.connectToSandbox.mockResolvedValueOnce(sandbox);

    await expect(packageSkillInSandbox({ sandboxId: 'sandbox-1' })).resolves.toEqual(
      Buffer.from([1, 2, 3])
    );
    expect(mocks.validateDeployableSkillWorkspacePackage).toHaveBeenCalledTimes(1);
  });

  it('fails packaging when the pre-package SKILL.md scan exits non-zero', async () => {
    const sandbox = createPackageSandbox(undefined, {
      findOutput: '',
      scanExitCode: 1,
      scanStderr: 'find: permission denied'
    });
    mocks.connectToSandbox.mockResolvedValueOnce(sandbox);

    await expect(packageSkillInSandbox({ sandboxId: 'sandbox-1' })).rejects.toThrow(
      'Failed to scan SKILL.md entries before packaging: find: permission denied'
    );
    expect(mocks.validateDeployableSkillWorkspacePackage).not.toHaveBeenCalled();
    expect(mocks.disconnectSandbox).toHaveBeenCalledWith(sandbox);
  });

  it('rejects selected SKILL.md paths containing a newline', async () => {
    // 含换行的入口虽然能通过 zip，但 sandbox unzip 落盘时会改名，发布前必须拒绝。
    const sandbox = createPackageSandbox(undefined, {
      findOutput: './pkg/SKILL.md\0./line\nbreak/SKILL.md\0',
      unzipOutput: './pkg/SKILL.md\n./line^Jbreak/SKILL.md\n'
    });
    mocks.connectToSandbox.mockResolvedValueOnce(sandbox);

    await expect(packageSkillInSandbox({ sandboxId: 'sandbox-1' })).rejects.toThrow(
      'Unsupported SKILL.md path with control characters (rejected by sandbox unzip): line\nbreak/SKILL.md'
    );
    expect(mocks.validateDeployableSkillWorkspacePackage).not.toHaveBeenCalled();
  });

  it('rejects selected SKILL.md paths containing a tab', async () => {
    const sandbox = createPackageSandbox(undefined, {
      findOutput: './pkg/SKILL.md\0./tab\tbreak/SKILL.md\0',
      unzipOutput: './pkg/SKILL.md\n./tab^Ibreak/SKILL.md\n'
    });
    mocks.connectToSandbox.mockResolvedValueOnce(sandbox);

    await expect(packageSkillInSandbox({ sandboxId: 'sandbox-1' })).rejects.toThrow(
      'Unsupported SKILL.md path with control characters (rejected by sandbox unzip): tab\tbreak/SKILL.md'
    );
    expect(mocks.validateDeployableSkillWorkspacePackage).not.toHaveBeenCalled();
  });

  it('accepts packaging when every scanned entry is retained', async () => {
    const sandbox = createPackageSandbox(undefined, {
      findOutput: './skills/writer/SKILL.md\0',
      unzipOutput: './skills/writer/SKILL.md\n'
    });
    mocks.connectToSandbox.mockResolvedValueOnce(sandbox);

    await expect(packageSkillInSandbox({ sandboxId: 'sandbox-1' })).resolves.toEqual(
      Buffer.from([1, 2, 3])
    );
    expect(mocks.validateDeployableSkillWorkspacePackage).toHaveBeenCalledTimes(1);
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

describe('normalizeArchiveListedEntryPath', () => {
  it('maps newline, carriage return and tab to distinct unzip display markers', () => {
    expect(normalizeArchiveListedEntryPath('a\nb\rc\td')).toBe('a^Jb^Mc^Id');
  });

  it('keeps ordinary paths unchanged', () => {
    expect(normalizeArchiveListedEntryPath('./skills/writer/SKILL.md')).toBe(
      './skills/writer/SKILL.md'
    );
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
