import { createDefaultInstanceConfig } from '@test/utils/instanceConfigSnapshot';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { SandboxErrEnum } from '@fastgpt/global/common/error/code/sandbox';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { createTarZstStream, type TarEntry } from '@fastgpt/service/common/file/tarZst';

const encodeTarZst = (entries: TarEntry[]) => buffer(createTarZstStream(entries));

const mocks = vi.hoisted(() => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  mongoSkillFindOne: vi.fn(),
  mongoVersionFindOne: vi.fn(),
  packSandboxDirectory: vi.fn(),
  uploadSkillPackageStream: vi.fn(),
  deleteSkillPackage: vi.fn(),
  connectToOpenSandbox: vi.fn(),
  disconnectSandbox: vi.fn(),
  getSandboxClient: vi.fn(),
  findSandboxInstanceBySandboxIdAndSource: vi.fn(),
  findSandboxResourcesBySource: vi.fn(),
  updateSandboxInstanceRecordBySandboxId: vi.fn(),
  assertSandboxAvailable: vi.fn(),
  prepareSandbox: vi.fn(),
  preparePackageMirrors: vi.fn(),
  prepareWorkDirectory: vi.fn(),
  emptyWorkDirectory: vi.fn(),
  deploySkillPackage: vi.fn(),
  withSandboxLease: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/skill/model/schema', () => ({
  MongoAgentSkills: { findOne: mocks.mongoSkillFindOne }
}));

vi.mock('@fastgpt/service/core/ai/skill/version/schema', () => ({
  MongoAgentSkillsVersion: { findOne: mocks.mongoVersionFindOne }
}));

vi.mock('@fastgpt/service/core/ai/skill/package/constants', () => ({
  DEFAULT_GITIGNORE_CONTENT: '.venv/\nnode_modules/\n'
}));

vi.mock('@fastgpt/service/core/ai/skill/package/storage', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@fastgpt/service/core/ai/skill/package/storage')>();
  return {
    ...actual,
    uploadSkillPackageStream: mocks.uploadSkillPackageStream,
    deleteSkillPackage: mocks.deleteSkillPackage
  };
});

vi.mock('@fastgpt/service/core/ai/sandbox/application/ideAgent', () => ({
  packSandboxDirectory: mocks.packSandboxDirectory
}));

vi.mock('@fastgpt/service/core/ai/skill/edit/config', () => ({
  EDIT_DEBUG_SANDBOX_CHAT_ID: 'edit-debug',
  getEditDebugSandboxId: (skillId: string) => `edit-debug-${skillId}`
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox/config', () => ({
  getOpenSandboxRuntimeConfig: vi.fn(({ createConfig }) => ({
    clientConfig: {
      baseUrl: 'http://opensandbox.local',
      apiKey: 'key',
      runtime: 'kubernetes',
      useServerProxy: true
    },
    rawImage: 'runtime-image:v2',
    image: { repository: 'runtime-image', tag: 'v2' },
    createConfig: {
      image: { repository: 'runtime-image', tag: 'v2' },
      ...createConfig
    }
  }))
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox/runtimeProfile', () => ({
  getSandboxRuntimeProfile: () => ({
    workDirectory: '/workspace',
    skillsRootPath: '/workspace/skills'
  })
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox/opensandbox', () => ({
  connectToOpenSandbox: mocks.connectToOpenSandbox,
  disconnectSandbox: mocks.disconnectSandbox
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

vi.mock('@fastgpt/service/core/ai/sandbox/application/availability', () => ({
  assertSandboxAvailable: mocks.assertSandboxAvailable
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

vi.mock('@fastgpt/service/core/ai/sandbox/application/lease', () => ({
  withSandboxLease: mocks.withSandboxLease
}));

import {
  getRunningSkillEditSandbox,
  getSkillEditRuntimeContext,
  initSkillEditRuntimeSandbox,
  packageAndUploadSkillTarZstInSandbox,
  streamSkillEditWorkspaceTarZst,
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
    existingInstance?: any;
  } = {}
): SkillEditRuntimeContext => ({
  skillId: 'skill-1',
  teamId: 'team-1',
  runtimeProfile: {
    workDirectory: '/workspace',
    skillsRootPath: '/workspace/skills'
  },
  createConfig: { image: { repository: 'runtime-image', tag: 'v2' } },
  runtimeImage: { repository: 'runtime-image', tag: 'v2' },
  currentVersion: { _id: 'version-1', skillId: 'skill-1', storageKey: 'storage-key' } as any,
  sessionId: 'edit-debug-skill-1',
  targetVersionId: 'version-1',
  existingInstance: params.existingInstance ?? null
});

const createPackageSandbox = (executeMock?: any) => ({
  execute:
    executeMock ??
    vi.fn(async () => ({ stdout: './skills/demo/SKILL.md\n', stderr: '', exitCode: 0 })),
  getFileInfo: vi.fn(
    async (paths: string[]) =>
      new Map(paths.map((path) => [path, { path, isDirectory: true, isFile: false }]))
  ),
  readFiles: vi.fn(async () => [{ path: '/workspace/.gitignore', content: '*.tmp\n', error: null }])
});

describe('skillEdit streaming packaging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global as any).systemInstanceConfig = createDefaultInstanceConfig();
    mocks.disconnectSandbox.mockResolvedValue(undefined);
    mocks.deleteSkillPackage.mockResolvedValue(undefined);
    mocks.withSandboxLease.mockImplementation(async ({ fn }) =>
      fn({ signal: new AbortController().signal, assertValid: vi.fn() })
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('streams POST /archive/pack directly to S3, validates workspace, and extracts runtimeSkills', async () => {
    const sandbox = createPackageSandbox();
    mocks.connectToOpenSandbox.mockResolvedValueOnce(sandbox);

    const tarZstBuffer = await encodeTarZst([
      { path: 'skills/', type: 'directory', mode: 0o755 },
      { path: 'skills/demo/', type: 'directory', mode: 0o755 },
      {
        path: 'skills/demo/SKILL.md',
        type: 'file',
        mode: 0o644,
        content: Buffer.from('---\nname: demo\ndescription: Demo skill\n---\n')
      },
      {
        path: 'skills/demo/data.bin',
        type: 'file',
        mode: 0o644,
        content: Buffer.alloc(64 * 1024, 9)
      }
    ]);

    mocks.packSandboxDirectory.mockResolvedValueOnce(Readable.from([tarZstBuffer]));
    let uploadedKeyStreamBuffer: Buffer | undefined;
    mocks.uploadSkillPackageStream.mockImplementationOnce(async ({ packageStream }) => {
      const chunks: Buffer[] = [];
      for await (const chunk of packageStream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      uploadedKeyStreamBuffer = Buffer.concat(chunks);
      return { key: 'agent-skills/team-1/skill-1/version-1.tar.zst' };
    });

    const result = await packageAndUploadSkillTarZstInSandbox({
      teamId: 'team-1',
      skillId: 'skill-1',
      packageObjectId: 'version-1',
      sandboxId: 'sandbox-1',
      instanceId: 'remote-osb-1'
    });

    expect(mocks.connectToOpenSandbox).toHaveBeenCalledWith({
      sandboxId: 'sandbox-1',
      remoteSandboxId: 'remote-osb-1'
    });
    expect(mocks.packSandboxDirectory).toHaveBeenCalledWith(
      expect.objectContaining({
        sandbox,
        targetDirectory: '/workspace',
        excludePatterns: expect.arrayContaining(['.fastgpt/', '*.tmp', 'node_modules/'])
      })
    );
    expect(uploadedKeyStreamBuffer).toEqual(tarZstBuffer);
    expect(result).toEqual({
      storageInfo: { key: 'agent-skills/team-1/skill-1/version-1.tar.zst' },
      runtimeSkills: [
        {
          name: 'demo',
          description: 'Demo skill',
          path: 'skills/demo/SKILL.md'
        }
      ]
    });
    expect(mocks.deleteSkillPackage).not.toHaveBeenCalled();
    expect(mocks.disconnectSandbox).toHaveBeenCalledWith(sandbox);
  });

  it('cleans up uploaded uncommitted S3 object when workspace deployable validation fails', async () => {
    const sandbox = createPackageSandbox();
    mocks.connectToOpenSandbox.mockResolvedValueOnce(sandbox);

    const invalidTarZst = await encodeTarZst([
      { path: 'skills/', type: 'directory', mode: 0o755 },
      { path: 'skills/no-skill-md/', type: 'directory', mode: 0o755 },
      {
        path: 'skills/no-skill-md/README.md',
        type: 'file',
        mode: 0o644,
        content: Buffer.from('x')
      }
    ]);

    mocks.packSandboxDirectory.mockResolvedValueOnce(Readable.from([invalidTarZst]));
    mocks.uploadSkillPackageStream.mockImplementationOnce(async ({ packageStream }) => {
      for await (const _chunk of packageStream) {
        // consume stream
      }
      return { key: 'agent-skills/team-1/skill-1/orphan-v.tar.zst' };
    });

    await expect(
      packageAndUploadSkillTarZstInSandbox({
        teamId: 'team-1',
        skillId: 'skill-1',
        packageObjectId: 'orphan-v',
        sandboxId: 'sandbox-1'
      })
    ).rejects.toThrow('Each first-level skill folder under skills/ must contain SKILL.md');

    expect(mocks.deleteSkillPackage).toHaveBeenCalledWith(
      'agent-skills/team-1/skill-1/orphan-v.tar.zst'
    );
    expect(mocks.disconnectSandbox).toHaveBeenCalledWith(sandbox);
  });

  it('streams workspace .tar.zst for export with basicZip SKILL.md preflight check and cleans up sandbox connection', async () => {
    const sandbox = createPackageSandbox();
    mocks.findSandboxInstanceBySandboxIdAndSource.mockResolvedValueOnce({
      provider: 'opensandbox',
      sandboxId: 'edit-debug-skill-1',
      instanceId: 'remote-osb-1',
      status: 'running',
      teamId: 'team-1'
    });
    mocks.connectToOpenSandbox.mockResolvedValueOnce(sandbox);

    const tarZstBuffer = await encodeTarZst([
      { path: 'SKILL.md', type: 'file', mode: 0o644, content: Buffer.from('# Root\n') }
    ]);
    mocks.packSandboxDirectory.mockResolvedValueOnce(Readable.from([tarZstBuffer]));

    const chunks: Buffer[] = [];
    await streamSkillEditWorkspaceTarZst({
      skillId: 'skill-1',
      teamId: 'team-1',
      onStreamReady: async (stream) => {
        for await (const chunk of stream) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
      }
    });

    expect(Buffer.concat(chunks)).toEqual(tarZstBuffer);
    expect(mocks.disconnectSandbox).toHaveBeenCalledWith(sandbox);
  });

  it('propagates pack HTTP errors and disconnects', async () => {
    const sandbox = createPackageSandbox();
    mocks.connectToOpenSandbox.mockResolvedValueOnce(sandbox);
    mocks.packSandboxDirectory.mockRejectedValueOnce(new Error('read failed'));

    await expect(
      packageAndUploadSkillTarZstInSandbox({
        teamId: 'team-1',
        skillId: 'skill-1',
        packageObjectId: 'v1',
        sandboxId: 'sandbox-1'
      })
    ).rejects.toThrow('read failed');
    expect(mocks.disconnectSandbox).toHaveBeenCalledWith(sandbox);
  });
});

describe('skill edit runtime initialization', () => {
  const opensandbox = { status: { state: 'Running' } };
  const client = { opensandbox, delete: vi.fn(async () => undefined) };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSandboxClient.mockResolvedValue(client);
    mocks.prepareSandbox.mockResolvedValue(undefined);
    mocks.preparePackageMirrors.mockReturnValue({ step: 'mirrors' });
    mocks.prepareWorkDirectory.mockReturnValue({ step: 'workdir' });
    mocks.emptyWorkDirectory.mockReturnValue({ step: 'empty' });
    mocks.deploySkillPackage.mockReturnValue({ step: 'deploy' });
    mocks.updateSandboxInstanceRecordBySandboxId.mockResolvedValue(createResource());
    mocks.disconnectSandbox.mockResolvedValue(undefined);
    const lease = { signal: new AbortController().signal, assertValid: vi.fn() };
    mocks.withSandboxLease.mockImplementation(async ({ fn }) => fn(lease));
  });

  it('routes stopped runtime activation through shared client and reports upgrading progress on onUpgrade', async () => {
    const stopped = createResource('stopped');
    const progressEvents: Array<{ sandboxId: string; phase: string }> = [];
    mocks.getSandboxClient.mockImplementationOnce(async (_query, options) => {
      options?.onUpgrade?.();
      return client;
    });

    await initSkillEditRuntimeSandbox({
      context: createContext({ existingInstance: stopped }),
      onProgress: (item) => progressEvents.push(item)
    });

    expect(mocks.getSandboxClient).toHaveBeenCalledWith(
      {
        sandboxId: 'edit-debug-skill-1',
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: 'skill-1',
        userId: ChatSourceTypeEnum.skillEdit,
        chatId: 'edit-debug'
      },
      expect.objectContaining({
        createConfig: expect.any(Object),
        onUpgrade: expect.any(Function)
      })
    );
    expect(mocks.prepareSandbox).toHaveBeenCalledWith(
      expect.objectContaining({ sandbox: opensandbox, workDirectory: '/workspace' }),
      { step: 'mirrors' },
      { step: 'workdir' }
    );
    expect(mocks.updateSandboxInstanceRecordBySandboxId).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'opensandbox',
        userId: ChatSourceTypeEnum.skillEdit,
        touchActive: true
      })
    );
    expect(progressEvents).toEqual([
      { sandboxId: 'edit-debug-skill-1', phase: 'creatingContainer' },
      { sandboxId: 'edit-debug-skill-1', phase: 'creatingContainer' },
      { sandboxId: 'edit-debug-skill-1', phase: 'ready' }
    ]);
  });

  it('deploys the target package after runtime client restores an outdated record', async () => {
    const archived = createResource('archived', {
      image: { repository: 'old-image', tag: 'v1' },
      versionId: 'old-version',
      storage: {
        archive: {
          objectKey: 'k',
          generation: 'g',
          format: 'tar.zst',
          sizeBytes: 12,
          archivedAt: new Date()
        }
      }
    });

    await initSkillEditRuntimeSandbox({
      context: createContext({ existingInstance: archived })
    });

    expect(mocks.updateSandboxInstanceRecordBySandboxId).toHaveBeenCalledWith(
      expect.objectContaining({
        versionId: 'version-1',
        teamId: 'team-1'
      })
    );
  });

  it('skips redundant redeploy under withSandboxLease when concurrent init already deployed versionId', async () => {
    mocks.findSandboxInstanceBySandboxIdAndSource.mockResolvedValueOnce(
      createResource('running', { versionId: 'version-1' })
    );

    await initSkillEditRuntimeSandbox({
      context: createContext()
    });

    expect(mocks.withSandboxLease).toHaveBeenCalledWith(
      expect.objectContaining({
        sandboxId: 'edit-debug-skill-1',
        label: 'skill-edit:init:edit-debug-skill-1'
      })
    );
    expect(mocks.emptyWorkDirectory).not.toHaveBeenCalled();
    expect(mocks.deploySkillPackage).not.toHaveBeenCalled();
    expect(mocks.prepareSandbox).toHaveBeenCalledWith(
      expect.objectContaining({
        sandbox: opensandbox,
        lease: expect.objectContaining({ assertValid: expect.any(Function) })
      }),
      { step: 'mirrors' },
      { step: 'workdir' }
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
        context: createContext({ existingInstance: createResource('running') })
      })
    ).rejects.toThrow('deploy failed');
    expect(client.delete).not.toHaveBeenCalled();
  });
});

describe('skill edit runtime context and read-only query', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertSandboxAvailable.mockResolvedValue(undefined);
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
    mocks.assertSandboxAvailable.mockRejectedValueOnce(new Error('denied'));

    await expect(
      getSkillEditRuntimeContext({ skillId: 'skill-1', teamId: 'team-1' })
    ).rejects.toThrow('denied');
    expect(mocks.mongoSkillFindOne).not.toHaveBeenCalled();
  });

  it('throws 409 migration in progress error when existing edit instance is unmigrated', async () => {
    mocks.findSandboxResourcesBySource.mockResolvedValueOnce([
      createResource('running', { provider: 'sealosdevbox' as any })
    ]);
    await expect(
      getSkillEditRuntimeContext({ skillId: 'skill-1', teamId: 'team-1' })
    ).rejects.toThrow(SandboxErrEnum.agentSandboxMigrationInProgress);

    mocks.findSandboxResourcesBySource.mockResolvedValueOnce([
      createResource('archived', {
        storage: {
          archive: {
            objectKey: 'k',
            generation: 'g',
            format: 'zip',
            sizeBytes: 10,
            archivedAt: new Date()
          }
        }
      })
    ]);
    await expect(
      getSkillEditRuntimeContext({ skillId: 'skill-1', teamId: 'team-1' })
    ).rejects.toThrow(SandboxErrEnum.agentSandboxMigrationInProgress);
  });

  it('returns only a migrated running instance owned by the requested team', async () => {
    mocks.findSandboxInstanceBySandboxIdAndSource.mockResolvedValueOnce(
      createResource('running', { teamId: 'team-1' })
    );

    await expect(
      getRunningSkillEditSandbox({ skillId: 'skill-1', teamId: 'team-1' })
    ).resolves.toMatchObject({ sandboxId: 'edit-debug-skill-1' });

    const queryArg = mocks.findSandboxInstanceBySandboxIdAndSource.mock.calls[0][0];
    expect(queryArg).not.toHaveProperty('provider');

    mocks.findSandboxInstanceBySandboxIdAndSource.mockResolvedValueOnce(
      createResource('running', { teamId: 'team-1', provider: 'sealosdevbox' as any })
    );
    await expect(
      getRunningSkillEditSandbox({ skillId: 'skill-1', teamId: 'team-1' })
    ).rejects.toThrow(SandboxErrEnum.agentSandboxMigrationInProgress);

    mocks.findSandboxInstanceBySandboxIdAndSource.mockResolvedValueOnce(
      createResource('running', { teamId: 'other-team' })
    );
    await expect(
      getRunningSkillEditSandbox({ skillId: 'skill-1', teamId: 'team-1' })
    ).resolves.toBeUndefined();
  });
});
