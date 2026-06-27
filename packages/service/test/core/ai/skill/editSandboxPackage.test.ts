import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

const mocks = vi.hoisted(() => ({
  connectToSandbox: vi.fn(),
  disconnectSandbox: vi.fn(),
  deleteWorkspaceArchive: vi.fn(),
  archiveSandboxResourceForRuntimeUpgrade: vi.fn(),
  markSandboxRuntimeUpgradeArchiveFailed: vi.fn(),
  prepareSandboxRuntimeMirrors: vi.fn(),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/ai/skill/model/schema', () => ({
  MongoAgentSkills: {
    findOne: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/ai/skill/version/schema', () => ({
  MongoAgentSkillsVersion: {
    findOne: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/ai/skill/package', () => ({
  downloadSkillPackage: vi.fn(),
  DEFAULT_GITIGNORE_CONTENT: '.venv/\nnode_modules/\n',
  validateDeployableSkillWorkspacePackage: vi.fn(async () => ({
    valid: true,
    files: []
  })),
  validateZipStructure: vi.fn(async () => ({
    valid: true,
    hasSkillMd: true,
    files: []
  }))
}));

vi.mock('@fastgpt/service/env', () => ({
  serviceEnv: {
    AGENT_SANDBOX_SKILL_MAX_SIZE: 1
  }
}));

vi.mock('@fastgpt/service/core/ai/skill/edit/config', () => ({
  EDIT_DEBUG_SANDBOX_CHAT_ID: 'edit-debug',
  getEditDebugSandboxId: (skillId: string) => `edit-debug-${skillId}`
}));

vi.mock('@fastgpt/service/core/ai/sandbox/provider/config', () => ({
  getSandboxProviderConfig: () => ({
    provider: 'test-provider'
  }),
  validateSandboxConfig: vi.fn(),
  getSandboxAdapterConfig: vi.fn((opts = {}) => {
    const createConfig = opts.runtime
      ? {
          ...opts.createConfig,
          image: opts.createConfig?.image ?? { repository: 'new-runtime', tag: 'v2' }
        }
      : opts.createConfig;

    return {
      providerConfig: {
        provider: opts.provider || 'test-provider'
      },
      createConfig
    };
  })
}));

vi.mock('@fastgpt/service/core/ai/sandbox/runtime/profile', () => ({
  buildBaseSandboxRuntimeEnv: vi.fn(() => ({
    FASTGPT_WORKDIR: '/workspace'
  })),
  getSandboxRuntimeProfile: () => ({
    provider: 'opensandbox',
    workDirectory: '/workspace',
    skillsRootPath: '/workspace/skills',
    entrypoint: 'sleep infinity',
    buildConfig: vi.fn()
  })
}));

vi.mock('@fastgpt/service/core/ai/sandbox/provider/lifecycle', () => ({
  connectReadySandboxByInstance: vi.fn(),
  connectToSandbox: mocks.connectToSandbox,
  disconnectSandbox: mocks.disconnectSandbox,
  getReadySandboxInfo: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/sandbox/provider/adapter', () => ({
  buildSandboxAdapter: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/sandbox/service/runtime', () => ({
  getSandboxClient: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/sandbox/service/archive', () => ({
  archiveSandboxResourceForRuntimeUpgrade: mocks.archiveSandboxResourceForRuntimeUpgrade
}));

vi.mock('@fastgpt/service/core/ai/sandbox/runtime/mirrors', () => ({
  prepareSandboxRuntimeMirrors: mocks.prepareSandboxRuntimeMirrors
}));

vi.mock('@fastgpt/service/common/s3/sources/sandbox', () => ({
  getS3SandboxSource: () => ({
    deleteWorkspaceArchive: mocks.deleteWorkspaceArchive
  })
}));

vi.mock('@fastgpt/service/core/ai/sandbox/instance/repository', () => ({
  countRunningSandboxInstancesByType: vi.fn(),
  deleteSandboxResourceRecord: vi.fn(),
  deleteStaleRuntimeUpgradeArchivingRecord: vi.fn(),
  deleteSandboxInstanceRecord: vi.fn(),
  findSandboxInstanceBySandboxId: vi.fn(),
  findSandboxInstanceArchiveState: vi.fn(),
  findSandboxResourcesBySourceChatTypeExcludeProvider: vi.fn(),
  markSandboxRuntimeUpgradeArchiveFailed: mocks.markSandboxRuntimeUpgradeArchiveFailed,
  migrateArchivedSandboxInstanceRecord: vi.fn(),
  updateSandboxInstanceRecordBySandboxId: vi.fn()
}));

vi.mock('@fastgpt/service/common/logger', () => ({
  getLogger: () => mocks.logger,
  LogCategories: {
    MODULE: {
      AI: {
        AGENT: 'agent'
      }
    }
  }
}));

vi.mock('@fastgpt/service/support/permission/teamLimit', () => ({
  checkTeamSandboxPermission: vi.fn()
}));

import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { MongoAgentSkillsVersion } from '@fastgpt/service/core/ai/skill/version/schema';
import {
  downloadSkillPackage,
  validateDeployableSkillWorkspacePackage,
  validateZipStructure
} from '@fastgpt/service/core/ai/skill/package';
import {
  createEditDebugSandbox,
  packageSkillInSandbox
} from '@fastgpt/service/core/ai/skill/edit/sandbox';
import {
  connectReadySandboxByInstance,
  getReadySandboxInfo
} from '@fastgpt/service/core/ai/sandbox/provider/lifecycle';
import { buildSandboxAdapter } from '@fastgpt/service/core/ai/sandbox/provider/adapter';
import { getSandboxClient } from '@fastgpt/service/core/ai/sandbox/service/runtime';
import {
  countRunningSandboxInstancesByType,
  deleteSandboxResourceRecord,
  deleteStaleRuntimeUpgradeArchivingRecord,
  deleteSandboxInstanceRecord,
  findSandboxInstanceBySandboxId,
  findSandboxInstanceArchiveState,
  findSandboxResourcesBySourceChatTypeExcludeProvider,
  migrateArchivedSandboxInstanceRecord,
  updateSandboxInstanceRecordBySandboxId
} from '@fastgpt/service/core/ai/sandbox/instance/repository';
import { checkTeamSandboxPermission } from '@fastgpt/service/support/permission/teamLimit';
import { SandboxErrEnum } from '@fastgpt/global/common/error/code/sandbox';
import { getErrText } from '@fastgpt/global/common/error/utils';

type MockReadFileResult = {
  path: string;
  content: Uint8Array | string;
  error: Error | null;
}[];

const createSandbox = ({ readFilesResult }: { readFilesResult: MockReadFileResult }) => {
  const sandbox = {
    execute: vi.fn(async (command: string) => {
      if (command === 'printf "%s" "$HOME"') {
        return { exitCode: 0, stdout: '/home/sandbox', stderr: '' };
      }
      if (command.startsWith('[ -d ')) {
        return { exitCode: 0, stdout: '', stderr: '' };
      }
      if (command.includes('find . ') && command.includes('-prune')) {
        return { exitCode: 0, stdout: '12', stderr: '' };
      }
      if (command.startsWith('cd ')) {
        return { exitCode: 0, stdout: 'zip ok', stderr: '' };
      }
      if (command.startsWith('rm -f ')) {
        return { exitCode: 0, stdout: '', stderr: '' };
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    }),
    readFiles: vi.fn(async (paths: string[]) => {
      if (paths.some((path) => path.startsWith('/home/sandbox/.fastgpt/tmp/'))) {
        return readFilesResult;
      }
      return [];
    })
  };

  return sandbox;
};

describe('packageSkillInSandbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the packaged zip content and removes the temporary zip', async () => {
    const zipContent = new Uint8Array([1, 2, 3]);
    const sandbox = createSandbox({
      readFilesResult: [
        {
          path: '/home/sandbox/.fastgpt/tmp/skill-package.zip',
          content: zipContent,
          error: null
        }
      ]
    });
    mocks.connectToSandbox.mockResolvedValueOnce(sandbox);

    await expect(packageSkillInSandbox({ sandboxId: 'sandbox-1' })).resolves.toEqual(
      Buffer.from(zipContent)
    );

    const zipReadCall = vi
      .mocked(sandbox.readFiles)
      .mock.calls.find(([paths]) => paths.some((path) => path.endsWith('.zip')));
    expect(zipReadCall?.[0][0]).toMatch(/^\/home\/sandbox\/\.fastgpt\/tmp\/skill-package-.+\.zip$/);
    expect(sandbox.execute).toHaveBeenCalledWith("mkdir -p '/home/sandbox/.fastgpt/tmp'");
    expect(sandbox.execute).toHaveBeenCalledWith(
      expect.stringMatching(
        /^cd '\/workspace' && zip -r -y '\/home\/sandbox\/\.fastgpt\/tmp\/skill-package-.+\.zip' \./
      )
    );
    expect(sandbox.execute).toHaveBeenCalledWith(
      expect.stringMatching(/^rm -f '\/home\/sandbox\/\.fastgpt\/tmp\/skill-package-.+\.zip'$/)
    );
    expect(sandbox.execute).not.toHaveBeenCalledWith("rm -f '/workspace/package.zip'");
    expect(validateDeployableSkillWorkspacePackage).toHaveBeenCalledWith(Buffer.from(zipContent), {
      maxUncompressedBytes: 1024 * 1024
    });
    expect(validateZipStructure).not.toHaveBeenCalled();
    expect(mocks.disconnectSandbox).toHaveBeenCalledWith(sandbox);
  });

  it('uses basic zip validation when packaging for export', async () => {
    const zipContent = new Uint8Array([1, 2, 3]);
    const sandbox = createSandbox({
      readFilesResult: [
        {
          path: '/home/sandbox/.fastgpt/tmp/skill-package.zip',
          content: zipContent,
          error: null
        }
      ]
    });
    mocks.connectToSandbox.mockResolvedValueOnce(sandbox);

    await expect(
      packageSkillInSandbox({ sandboxId: 'sandbox-1', validationMode: 'basicZip' })
    ).resolves.toEqual(Buffer.from(zipContent));

    expect(validateZipStructure).toHaveBeenCalledWith(Buffer.from(zipContent), {
      maxUncompressedBytes: 1024 * 1024
    });
    expect(validateDeployableSkillWorkspacePackage).not.toHaveBeenCalled();
  });

  it('throws when the final package zip exceeds the skill package limit', async () => {
    const zipContent = new Uint8Array(1024 * 1024 + 1);
    const sandbox = createSandbox({
      readFilesResult: [
        {
          path: '/home/sandbox/.fastgpt/tmp/skill-package.zip',
          content: zipContent,
          error: null
        }
      ]
    });
    mocks.connectToSandbox.mockResolvedValueOnce(sandbox);

    await expect(packageSkillInSandbox({ sandboxId: 'sandbox-1' })).rejects.toThrow(
      'Skill package size'
    );

    expect(validateDeployableSkillWorkspacePackage).not.toHaveBeenCalled();
    expect(validateZipStructure).not.toHaveBeenCalled();
    expect(sandbox.execute).toHaveBeenCalledWith(
      expect.stringMatching(/^rm -f '\/home\/sandbox\/\.fastgpt\/tmp\/skill-package-.+\.zip'$/)
    );
    expect(mocks.disconnectSandbox).toHaveBeenCalledWith(sandbox);
  });

  it('throws when the package zip read reports an error', async () => {
    const sandbox = createSandbox({
      readFilesResult: [
        {
          path: '/home/sandbox/.fastgpt/tmp/skill-package.zip',
          content: new Uint8Array(),
          error: new Error('read failed')
        }
      ]
    });
    mocks.connectToSandbox.mockResolvedValueOnce(sandbox);

    await expect(packageSkillInSandbox({ sandboxId: 'sandbox-1' })).rejects.toThrow(
      'Failed to read package file in sandbox: read failed'
    );

    expect(sandbox.execute).toHaveBeenCalledWith(
      expect.stringMatching(/^rm -f '\/home\/sandbox\/\.fastgpt\/tmp\/skill-package-.+\.zip'$/)
    );
    expect(mocks.disconnectSandbox).toHaveBeenCalledWith(sandbox);
  });

  it('applies default ignore rules and root workspace gitignore when packaging', async () => {
    const gitignoreContent = 'dist/\n';
    const zipContent = new Uint8Array([9, 8, 7]);
    const sandbox = {
      execute: vi.fn(async (command: string) => {
        if (command === 'printf "%s" "$HOME"') {
          return { exitCode: 0, stdout: '/home/sandbox', stderr: '' };
        }
        if (command.startsWith('[ -d ')) {
          return { exitCode: 0, stdout: '', stderr: '' };
        }
        if (command.includes('find . ') && command.includes('-prune')) {
          return { exitCode: 0, stdout: '100', stderr: '' };
        }
        if (command.startsWith('cd ')) {
          return { exitCode: 0, stdout: 'zip ok', stderr: '' };
        }
        if (command.startsWith('rm -f ')) {
          return { exitCode: 0, stdout: '', stderr: '' };
        }
        return { exitCode: 0, stdout: '', stderr: '' };
      }),
      readFiles: vi.fn(async (paths: string[]) => {
        if (paths.includes('/workspace/.gitignore')) {
          return [{ path: '/workspace/.gitignore', content: gitignoreContent, error: null }];
        }
        if (paths.some((path) => path.startsWith('/home/sandbox/.fastgpt/tmp/'))) {
          return [
            {
              path: '/home/sandbox/.fastgpt/tmp/skill-package.zip',
              content: zipContent,
              error: null
            }
          ];
        }
        return [];
      })
    };
    mocks.connectToSandbox.mockResolvedValueOnce(sandbox);

    await expect(packageSkillInSandbox({ sandboxId: 'sandbox-1' })).resolves.toEqual(
      Buffer.from(zipContent)
    );

    expect(sandbox.readFiles).toHaveBeenCalledWith(['/workspace/.gitignore']);
    expect(sandbox.execute).toHaveBeenCalledWith(
      expect.stringContaining("-name '.venv' -o -name 'node_modules'")
    );
    expect(sandbox.execute).toHaveBeenCalledWith(expect.stringContaining("-x '.venv/*'"));
    expect(sandbox.execute).toHaveBeenCalledWith(expect.stringContaining("-x '*/.venv/*'"));
    expect(sandbox.execute).toHaveBeenCalledWith(expect.stringContaining("-x 'dist/*'"));
    expect(sandbox.execute).toHaveBeenCalledWith(expect.stringContaining("-x '*/dist/*'"));
  });
});

describe('createEditDebugSandbox', () => {
  const mockCurrentSkillVersion = (skillId: string) => {
    vi.mocked(MongoAgentSkills.findOne).mockResolvedValueOnce({
      _id: skillId,
      name: '测试的',
      currentVersionId: 'version-1'
    } as any);
    vi.mocked(MongoAgentSkillsVersion.findOne).mockResolvedValueOnce({
      _id: 'version-1',
      storageKey: 'storage-key'
    } as any);
  };

  const mockReadySandboxRecord = (docId = 'doc-1') => {
    vi.mocked(getReadySandboxInfo).mockResolvedValueOnce({
      image: { repository: 'test-image' },
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      status: { state: 'Running' }
    } as any);
    vi.mocked(updateSandboxInstanceRecordBySandboxId).mockResolvedValueOnce({
      _id: docId
    } as any);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkTeamSandboxPermission).mockResolvedValue(undefined);
    vi.mocked(deleteSandboxResourceRecord).mockResolvedValue({} as any);
    mocks.markSandboxRuntimeUpgradeArchiveFailed.mockResolvedValue(undefined);
    vi.mocked(findSandboxInstanceArchiveState).mockResolvedValue(null);
    vi.mocked(buildSandboxAdapter).mockReturnValue({
      getInfo: vi.fn(async () => ({
        status: { state: 'Running' }
      }))
    } as any);
  });

  it('throws structured sandbox error when team has no sandbox permission', async () => {
    vi.mocked(checkTeamSandboxPermission).mockRejectedValueOnce(new Error('no permission'));

    const promise = createEditDebugSandbox({
      skillId: 'skill-1',
      teamId: 'team-1',
      tmbId: 'tmb-1'
    });

    await expect(promise).rejects.toMatchObject({
      message: SandboxErrEnum.agentSandboxPermissionDenied
    });
    await expect(promise.catch((error) => getErrText(error))).resolves.toBe(
      'common:code_error.sandbox_error.agent_sandbox_permission_denied'
    );

    expect(MongoAgentSkills.findOne).not.toHaveBeenCalled();
  });

  it('uploads zip packages and decompresses inside the sandbox so Chinese skill directory names are preserved', async () => {
    const packageBuffer = Buffer.from('zip');
    const skillId = 'skill-1';
    const provider = {
      status: { state: 'Running' },
      execute: vi.fn(async (command: string) => {
        if (command === "mkdir -p '/workspace'") {
          return { exitCode: 0, stdout: '', stderr: '' };
        }
        if (
          command === "mkdir -p '/workspace/skills'" ||
          command === "rm -rf '/workspace/skills' && mkdir -p '/workspace/skills'"
        ) {
          return { exitCode: 0, stdout: '', stderr: '' };
        }
        if (command.includes('unzip')) {
          return { exitCode: 0, stdout: '', stderr: '' };
        }
        return { exitCode: 1, stdout: '', stderr: `Unexpected command: ${command}` };
      }),
      writeFiles: vi.fn(async (entries: Array<{ path: string; data: Buffer }>) =>
        entries.map((entry) => ({
          path: entry.path,
          bytesWritten: entry.data.length,
          error: null
        }))
      )
    };

    mockCurrentSkillVersion(skillId);
    vi.mocked(findSandboxInstanceBySandboxId).mockResolvedValueOnce(null);
    vi.mocked(findSandboxResourcesBySourceChatTypeExcludeProvider).mockResolvedValueOnce([]);
    vi.mocked(countRunningSandboxInstancesByType).mockResolvedValueOnce(0);
    vi.mocked(downloadSkillPackage).mockResolvedValueOnce(packageBuffer);
    vi.mocked(getSandboxClient).mockResolvedValueOnce({
      provider,
      delete: vi.fn()
    } as any);
    vi.mocked(getReadySandboxInfo).mockResolvedValueOnce({
      image: { repository: 'test-image' },
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      status: { state: 'Running' }
    } as any);
    vi.mocked(updateSandboxInstanceRecordBySandboxId).mockResolvedValueOnce({
      _id: 'doc-1'
    } as any);

    await expect(
      createEditDebugSandbox({
        skillId,
        teamId: 'team-1',
        tmbId: 'tmb-1'
      })
    ).resolves.toMatchObject({
      sandboxId: `edit-debug-${skillId}`,
      status: { state: 'Running' }
    });

    expect(provider.writeFiles).toHaveBeenCalledWith([
      {
        path: '/workspace/skills/package.zip',
        data: packageBuffer
      }
    ]);
    expect(provider.execute).toHaveBeenCalledWith("mkdir -p '/workspace/skills'");
    expect(provider.execute).toHaveBeenCalledWith(expect.stringContaining('unzip'));
    expect(mocks.prepareSandboxRuntimeMirrors).toHaveBeenCalledWith({
      sandbox: provider
    });
    expect(mocks.disconnectSandbox).toHaveBeenCalledWith(provider);
  });

  it('restores current-provider archived edit-debug sandbox through runtime client instead of hot reuse', async () => {
    const skillId = 'skill-1';
    const provider = {
      status: { state: 'Running' },
      execute: vi.fn(async (command: string) => {
        if (command === "mkdir -p '/workspace'") {
          return { exitCode: 0, stdout: '', stderr: '' };
        }
        return { exitCode: 0, stdout: '', stderr: '' };
      }),
      writeFiles: vi.fn()
    };
    const archivedInstance = {
      _id: 'archived-current-provider-instance',
      provider: 'test-provider',
      sandboxId: `edit-debug-${skillId}`,
      metadata: {
        archive: {
          state: 'archived'
        },
        versionId: 'version-1',
        storage: {
          key: 'storage-key'
        }
      }
    };

    vi.mocked(MongoAgentSkills.findOne).mockResolvedValueOnce({
      _id: skillId,
      name: '测试的',
      currentVersionId: 'version-1'
    } as any);
    vi.mocked(MongoAgentSkillsVersion.findOne).mockResolvedValueOnce({
      _id: 'version-1',
      storageKey: 'storage-key'
    } as any);
    vi.mocked(findSandboxInstanceBySandboxId).mockResolvedValueOnce(archivedInstance as any);
    vi.mocked(findSandboxResourcesBySourceChatTypeExcludeProvider).mockResolvedValueOnce([]);
    vi.mocked(countRunningSandboxInstancesByType).mockResolvedValueOnce(0);
    vi.mocked(getSandboxClient).mockResolvedValueOnce({
      provider,
      delete: vi.fn()
    } as any);
    vi.mocked(getReadySandboxInfo).mockResolvedValueOnce({
      image: { repository: 'test-image' },
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      status: { state: 'Running' }
    } as any);
    vi.mocked(updateSandboxInstanceRecordBySandboxId).mockResolvedValueOnce({
      _id: 'doc-restored'
    } as any);

    await expect(
      createEditDebugSandbox({
        skillId,
        teamId: 'team-1',
        tmbId: 'tmb-1'
      })
    ).resolves.toMatchObject({
      sandboxId: `edit-debug-${skillId}`,
      status: { state: 'Running' }
    });

    expect(connectReadySandboxByInstance).not.toHaveBeenCalled();
    expect(deleteSandboxInstanceRecord).not.toHaveBeenCalled();
    expect(getSandboxClient).toHaveBeenCalledWith(
      {
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: skillId,
        sandboxId: `edit-debug-${skillId}`,
        userId: '',
        chatId: 'edit-debug'
      },
      expect.objectContaining({
        createConfig: expect.any(Object)
      })
    );
    expect(downloadSkillPackage).not.toHaveBeenCalled();
  });

  it('keeps restored archived edit-debug sandbox when startup fails after runtime restore', async () => {
    const skillId = 'skill-1';
    const provider = {
      status: { state: 'Running' },
      execute: vi.fn(),
      writeFiles: vi.fn()
    };
    const deleteSandbox = vi.fn(async () => undefined);
    const readyError = new Error('prepare runtime image failed');
    const archivedInstance = {
      _id: 'archived-current-provider-instance',
      provider: 'test-provider',
      sandboxId: `edit-debug-${skillId}`,
      metadata: {
        archive: {
          state: 'archived'
        },
        versionId: 'version-1',
        storage: {
          key: 'storage-key'
        }
      }
    };

    vi.mocked(MongoAgentSkills.findOne).mockResolvedValueOnce({
      _id: skillId,
      name: '测试的',
      currentVersionId: 'version-1'
    } as any);
    vi.mocked(MongoAgentSkillsVersion.findOne).mockResolvedValueOnce({
      _id: 'version-1',
      storageKey: 'storage-key'
    } as any);
    vi.mocked(findSandboxInstanceBySandboxId).mockResolvedValueOnce(archivedInstance as any);
    vi.mocked(findSandboxResourcesBySourceChatTypeExcludeProvider).mockResolvedValueOnce([]);
    vi.mocked(countRunningSandboxInstancesByType).mockResolvedValueOnce(0);
    vi.mocked(getSandboxClient).mockResolvedValueOnce({
      provider,
      delete: deleteSandbox
    } as any);
    vi.mocked(getReadySandboxInfo).mockRejectedValueOnce(readyError);

    await expect(
      createEditDebugSandbox({
        skillId,
        teamId: 'team-1',
        tmbId: 'tmb-1'
      })
    ).rejects.toThrow(readyError);

    expect(deleteSandbox).not.toHaveBeenCalled();
    expect(deleteSandboxInstanceRecord).not.toHaveBeenCalledWith(archivedInstance._id);
    expect(mocks.deleteWorkspaceArchive).not.toHaveBeenCalled();
    expect(downloadSkillPackage).not.toHaveBeenCalled();
    expect(updateSandboxInstanceRecordBySandboxId).not.toHaveBeenCalled();
    expect(mocks.disconnectSandbox).toHaveBeenCalledWith(provider);
  });

  it('recreates missing edit-debug sandbox without inspecting or re-deploying an empty workspace', async () => {
    const skillId = 'skill-1';
    const existingInstance = {
      _id: 'existing-instance',
      provider: 'test-provider',
      sandboxId: `edit-debug-${skillId}`,
      status: 'running',
      metadata: {
        image: { repository: 'new-runtime', tag: 'v2' },
        versionId: 'version-1'
      }
    };
    const provider = {
      status: { state: 'Running' },
      execute: vi.fn(async (command: string) => {
        if (command === "mkdir -p '/workspace'") {
          return { exitCode: 0, stdout: '', stderr: '' };
        }
        if (command.includes("test -n \"$(find '/workspace'")) {
          return { exitCode: 1, stdout: '', stderr: 'workspace should not be inspected' };
        }
        if (command === "mkdir -p '/workspace/skills'" || command.includes('unzip')) {
          return { exitCode: 0, stdout: '', stderr: '' };
        }
        return { exitCode: 1, stdout: '', stderr: `Unexpected command: ${command}` };
      }),
      writeFiles: vi.fn(async (entries: Array<{ path: string; data: Buffer }>) =>
        entries.map((entry) => ({
          path: entry.path,
          bytesWritten: entry.data.length,
          error: null
        }))
      )
    };

    mockCurrentSkillVersion(skillId);
    vi.mocked(findSandboxInstanceBySandboxId).mockResolvedValueOnce(existingInstance as any);
    vi.mocked(findSandboxResourcesBySourceChatTypeExcludeProvider).mockResolvedValueOnce([]);
    vi.mocked(buildSandboxAdapter).mockReturnValueOnce({
      getInfo: vi.fn(async () => null)
    } as any);
    vi.mocked(countRunningSandboxInstancesByType).mockResolvedValueOnce(0);
    vi.mocked(getSandboxClient).mockResolvedValueOnce({
      provider,
      delete: vi.fn()
    } as any);
    mockReadySandboxRecord('doc-recreated');

    await expect(
      createEditDebugSandbox({
        skillId,
        teamId: 'team-1',
        tmbId: 'tmb-1'
      })
    ).resolves.toMatchObject({
      sandboxId: `edit-debug-${skillId}`,
      status: { state: 'Running' }
    });

    expect(connectReadySandboxByInstance).not.toHaveBeenCalled();
    expect(deleteSandboxInstanceRecord).not.toHaveBeenCalledWith(existingInstance._id);
    expect(getSandboxClient).toHaveBeenCalled();
    expect(downloadSkillPackage).not.toHaveBeenCalled();
    expect(provider.writeFiles).not.toHaveBeenCalled();
    expect(provider.execute).not.toHaveBeenCalledWith(expect.stringContaining('unzip'));
  });

  it('reuses running edit-debug sandbox without inspecting or re-deploying an empty workspace', async () => {
    const skillId = 'skill-1';
    const existingInstance = {
      _id: 'existing-instance',
      provider: 'test-provider',
      sandboxId: `edit-debug-${skillId}`,
      status: 'running',
      metadata: {
        image: { repository: 'new-runtime', tag: 'v2' },
        versionId: 'version-1'
      }
    };
    const provider = {
      status: { state: 'Running' },
      execute: vi.fn(async (command: string) => {
        if (command === "mkdir -p '/workspace'") {
          return { exitCode: 0, stdout: '', stderr: '' };
        }
        if (command.includes("test -n \"$(find '/workspace'")) {
          return { exitCode: 1, stdout: '', stderr: 'workspace should not be inspected' };
        }
        if (command.includes('unzip')) {
          return { exitCode: 1, stdout: '', stderr: 'workspace should not be deployed' };
        }
        return { exitCode: 1, stdout: '', stderr: `Unexpected command: ${command}` };
      }),
      writeFiles: vi.fn()
    };

    mockCurrentSkillVersion(skillId);
    vi.mocked(findSandboxInstanceBySandboxId).mockResolvedValueOnce(existingInstance as any);
    vi.mocked(findSandboxResourcesBySourceChatTypeExcludeProvider).mockResolvedValueOnce([]);
    vi.mocked(connectReadySandboxByInstance).mockResolvedValueOnce({
      sandbox: provider
    } as any);
    vi.mocked(updateSandboxInstanceRecordBySandboxId).mockResolvedValueOnce({
      _id: 'doc-reused'
    } as any);

    await expect(
      createEditDebugSandbox({
        skillId,
        teamId: 'team-1',
        tmbId: 'tmb-1'
      })
    ).resolves.toMatchObject({
      sandboxId: `edit-debug-${skillId}`,
      status: { state: 'Running' }
    });

    expect(connectReadySandboxByInstance).toHaveBeenCalled();
    expect(getSandboxClient).not.toHaveBeenCalled();
    expect(downloadSkillPackage).not.toHaveBeenCalled();
    expect(provider.writeFiles).not.toHaveBeenCalled();
    expect(provider.execute).not.toHaveBeenCalledWith(expect.stringContaining('unzip'));
  });

  it('rejects when mismatched existing edit-debug sandbox cannot hot reload without cleanup or rebuild', async () => {
    const skillId = 'skill-1';
    const existingInstance = {
      _id: 'existing-instance',
      provider: 'test-provider',
      sandboxId: `edit-debug-${skillId}`,
      status: 'running',
      metadata: {
        image: { repository: 'new-runtime', tag: 'v2' },
        versionId: 'old-version'
      }
    };
    const connectError = new Error('connect failed');

    vi.mocked(MongoAgentSkills.findOne).mockResolvedValueOnce({
      _id: skillId,
      name: '测试的',
      currentVersionId: 'version-1'
    } as any);
    vi.mocked(MongoAgentSkillsVersion.findOne).mockResolvedValueOnce({
      _id: 'version-1',
      storageKey: 'storage-key'
    } as any);
    vi.mocked(findSandboxInstanceBySandboxId).mockResolvedValueOnce(existingInstance as any);
    vi.mocked(findSandboxResourcesBySourceChatTypeExcludeProvider).mockResolvedValueOnce([]);
    vi.mocked(connectReadySandboxByInstance).mockRejectedValueOnce(connectError);

    await expect(
      createEditDebugSandbox({
        skillId,
        teamId: 'team-1',
        tmbId: 'tmb-1'
      })
    ).rejects.toThrow(connectError);

    expect(deleteSandboxInstanceRecord).not.toHaveBeenCalledWith(existingInstance._id);
    expect(downloadSkillPackage).not.toHaveBeenCalled();
    expect(getSandboxClient).not.toHaveBeenCalled();
    expect(updateSandboxInstanceRecordBySandboxId).not.toHaveBeenCalled();
  });

  it.each([
    {
      title: 'no image metadata',
      metadata: { versionId: 'version-1' }
    },
    {
      title: 'empty image metadata from provider',
      metadata: { image: { repository: '' }, versionId: 'version-1' }
    }
  ])(
    'reports runtime upgrade requirement when existing edit-debug sandbox has $title',
    async ({ metadata }) => {
      const skillId = 'skill-1';
      const onProgress = vi.fn();
      const existingInstance = {
        _id: 'existing-instance',
        provider: 'test-provider',
        sandboxId: `edit-debug-${skillId}`,
        status: 'running',
        lastActiveAt: new Date('2026-01-01T00:00:00.000Z'),
        metadata
      };

      vi.mocked(MongoAgentSkills.findOne).mockResolvedValueOnce({
        _id: skillId,
        name: '测试的',
        currentVersionId: 'version-1'
      } as any);
      vi.mocked(MongoAgentSkillsVersion.findOne).mockResolvedValueOnce({
        _id: 'version-1',
        storageKey: 'storage-key'
      } as any);
      vi.mocked(findSandboxInstanceBySandboxId).mockResolvedValueOnce(existingInstance as any);

      await expect(
        createEditDebugSandbox({
          skillId,
          teamId: 'team-1',
          tmbId: 'tmb-1',
          onProgress
        })
      ).resolves.toMatchObject({
        sandboxId: `edit-debug-${skillId}`,
        status: { state: 'UpgradeRequired' }
      });

      expect(onProgress).toHaveBeenCalledWith({
        sandboxId: `edit-debug-${skillId}`,
        phase: 'runtimeUpgradeRequired'
      });
      expect(mocks.archiveSandboxResourceForRuntimeUpgrade).not.toHaveBeenCalled();
      expect(getSandboxClient).not.toHaveBeenCalled();
    }
  );

  it('archives outdated edit-debug sandbox when runtime upgrade is confirmed', async () => {
    const skillId = 'skill-1';
    const onProgress = vi.fn();
    const existingInstance = {
      _id: 'existing-instance',
      provider: 'test-provider',
      sandboxId: `edit-debug-${skillId}`,
      status: 'running',
      lastActiveAt: new Date('2026-01-01T00:00:00.000Z'),
      metadata: {
        image: { repository: 'old-runtime', tag: 'v1' },
        versionId: 'version-1'
      }
    };

    vi.mocked(MongoAgentSkills.findOne).mockResolvedValueOnce({
      _id: skillId,
      name: '测试的',
      currentVersionId: 'version-1'
    } as any);
    vi.mocked(MongoAgentSkillsVersion.findOne).mockResolvedValueOnce({
      _id: 'version-1',
      storageKey: 'storage-key'
    } as any);
    vi.mocked(findSandboxInstanceBySandboxId).mockResolvedValueOnce(existingInstance as any);
    mocks.archiveSandboxResourceForRuntimeUpgrade.mockResolvedValueOnce({ success: true });

    await expect(
      createEditDebugSandbox({
        skillId,
        teamId: 'team-1',
        tmbId: 'tmb-1',
        archiveForUpgrade: true,
        onProgress
      })
    ).resolves.toMatchObject({
      sandboxId: `edit-debug-${skillId}`,
      status: { state: 'UpgradePrepared' }
    });

    expect(mocks.archiveSandboxResourceForRuntimeUpgrade).toHaveBeenCalledWith(existingInstance, {
      ensureZipInSandbox: true
    });
    expect(onProgress).toHaveBeenNthCalledWith(1, {
      sandboxId: `edit-debug-${skillId}`,
      phase: 'runtimeUpgradeArchiving'
    });
    expect(onProgress).toHaveBeenNthCalledWith(2, {
      sandboxId: `edit-debug-${skillId}`,
      phase: 'runtimeUpgradeArchived'
    });
    expect(getSandboxClient).not.toHaveBeenCalled();
  });

  const setupRuntimeUpgradeArchiveFailure = () => {
    const skillId = 'skill-1';
    const existingInstance = {
      _id: 'existing-instance',
      provider: 'test-provider',
      sandboxId: `edit-debug-${skillId}`,
      status: 'running',
      lastActiveAt: new Date('2026-01-01T00:00:00.000Z'),
      metadata: {
        image: { repository: 'old-runtime', tag: 'v1' },
        versionId: 'version-1'
      }
    };
    vi.mocked(MongoAgentSkills.findOne).mockResolvedValueOnce({
      _id: skillId,
      name: '测试的',
      currentVersionId: 'version-1'
    } as any);
    vi.mocked(MongoAgentSkillsVersion.findOne).mockResolvedValueOnce({
      _id: 'version-1',
      storageKey: 'storage-key'
    } as any);
    vi.mocked(findSandboxInstanceBySandboxId).mockResolvedValueOnce(existingInstance as any);
    mocks.archiveSandboxResourceForRuntimeUpgrade.mockResolvedValueOnce({
      success: false,
      error: 'Sandbox container does not exist physically'
    });

    return { skillId, existingInstance };
  };

  it('rejects runtime upgrade without deleting outdated sandbox when archive fails', async () => {
    const { skillId, existingInstance } = setupRuntimeUpgradeArchiveFailure();
    const onProgress = vi.fn();

    await expect(
      createEditDebugSandbox({
        skillId,
        teamId: 'team-1',
        tmbId: 'tmb-1',
        archiveForUpgrade: true,
        onProgress
      })
    ).rejects.toThrow(SandboxErrEnum.runtimeUpgradeFailed);

    expect(mocks.archiveSandboxResourceForRuntimeUpgrade).toHaveBeenCalledWith(existingInstance, {
      ensureZipInSandbox: true
    });
    expect(downloadSkillPackage).not.toHaveBeenCalled();
    expect(getSandboxClient).not.toHaveBeenCalled();
    expect(deleteSandboxInstanceRecord).not.toHaveBeenCalledWith(existingInstance._id);
    expect(onProgress).toHaveBeenNthCalledWith(1, {
      sandboxId: `edit-debug-${skillId}`,
      phase: 'runtimeUpgradeArchiving'
    });
    expect(onProgress).toHaveBeenNthCalledWith(2, {
      sandboxId: `edit-debug-${skillId}`,
      phase: 'failed',
      message: SandboxErrEnum.runtimeUpgradeFailed
    });
  });

  it('keeps runtime upgrade modal loading when refreshed during active archiving', async () => {
    const skillId = 'skill-1';
    const onProgress = vi.fn();
    const archivingInstance = {
      _id: 'archiving-instance',
      provider: 'test-provider',
      sandboxId: `edit-debug-${skillId}`,
      status: 'stopped',
      lastActiveAt: new Date(),
      metadata: {
        image: { repository: 'old-runtime', tag: 'v1' },
        archive: {
          state: 'archiving',
          startedAt: new Date()
        },
        versionId: 'version-1'
      }
    };

    vi.mocked(MongoAgentSkills.findOne).mockResolvedValueOnce({
      _id: skillId,
      name: '测试的',
      currentVersionId: 'version-1'
    } as any);
    vi.mocked(MongoAgentSkillsVersion.findOne).mockResolvedValueOnce({
      _id: 'version-1',
      storageKey: 'storage-key'
    } as any);
    vi.mocked(findSandboxInstanceBySandboxId).mockResolvedValueOnce(archivingInstance as any);
    vi.mocked(findSandboxResourcesBySourceChatTypeExcludeProvider).mockResolvedValueOnce([]);

    await expect(
      createEditDebugSandbox({
        skillId,
        teamId: 'team-1',
        tmbId: 'tmb-1',
        onProgress
      })
    ).resolves.toMatchObject({
      sandboxId: `edit-debug-${skillId}`,
      status: { state: 'UpgradeInProgress' }
    });

    expect(onProgress).toHaveBeenCalledWith({
      sandboxId: `edit-debug-${skillId}`,
      phase: 'runtimeUpgradeArchiving'
    });
    expect(deleteStaleRuntimeUpgradeArchivingRecord).not.toHaveBeenCalled();
    expect(getSandboxClient).not.toHaveBeenCalled();
  });

  it('rejects duplicate runtime upgrade confirmation during active archiving', async () => {
    const skillId = 'skill-1';
    const onProgress = vi.fn();
    const archivingInstance = {
      _id: 'archiving-instance',
      provider: 'test-provider',
      sandboxId: `edit-debug-${skillId}`,
      status: 'stopped',
      lastActiveAt: new Date(),
      metadata: {
        image: { repository: 'old-runtime', tag: 'v1' },
        archive: {
          state: 'archiving',
          startedAt: new Date()
        },
        versionId: 'version-1'
      }
    };

    vi.mocked(MongoAgentSkills.findOne).mockResolvedValueOnce({
      _id: skillId,
      name: '测试的',
      currentVersionId: 'version-1'
    } as any);
    vi.mocked(MongoAgentSkillsVersion.findOne).mockResolvedValueOnce({
      _id: 'version-1',
      storageKey: 'storage-key'
    } as any);
    vi.mocked(findSandboxInstanceBySandboxId).mockResolvedValueOnce(archivingInstance as any);

    await expect(
      createEditDebugSandbox({
        skillId,
        teamId: 'team-1',
        tmbId: 'tmb-1',
        archiveForUpgrade: true,
        onProgress
      })
    ).rejects.toThrow(SandboxErrEnum.runtimeUpgradeInProgress);

    expect(onProgress).toHaveBeenCalledWith({
      sandboxId: `edit-debug-${skillId}`,
      phase: 'runtimeUpgradeArchiving'
    });
    expect(mocks.archiveSandboxResourceForRuntimeUpgrade).not.toHaveBeenCalled();
    expect(mocks.markSandboxRuntimeUpgradeArchiveFailed).not.toHaveBeenCalled();
    expect(deleteStaleRuntimeUpgradeArchivingRecord).not.toHaveBeenCalled();
    expect(getSandboxClient).not.toHaveBeenCalled();
  });

  it('marks timed-out runtime upgrade archiving state as failed without cleanup or rebuild', async () => {
    const skillId = 'skill-1';
    const onProgress = vi.fn();
    const archivingInstance = {
      _id: 'archiving-instance',
      provider: 'test-provider',
      sandboxId: `edit-debug-${skillId}`,
      status: 'stopped',
      lastActiveAt: new Date('2026-01-01T00:00:00.000Z'),
      metadata: {
        image: { repository: 'old-runtime', tag: 'v1' },
        archive: {
          state: 'archiving',
          startedAt: new Date('2026-01-01T00:00:00.000Z')
        },
        versionId: 'version-1'
      }
    };

    vi.mocked(MongoAgentSkills.findOne).mockResolvedValueOnce({
      _id: skillId,
      name: '测试的',
      currentVersionId: 'version-1'
    } as any);
    vi.mocked(MongoAgentSkillsVersion.findOne).mockResolvedValueOnce({
      _id: 'version-1',
      storageKey: 'storage-key'
    } as any);
    vi.mocked(findSandboxInstanceBySandboxId).mockResolvedValueOnce(archivingInstance as any);

    await expect(
      createEditDebugSandbox({
        skillId,
        teamId: 'team-1',
        tmbId: 'tmb-1',
        onProgress
      })
    ).rejects.toThrow(SandboxErrEnum.runtimeUpgradeFailed);

    expect(onProgress).toHaveBeenCalledWith({
      sandboxId: `edit-debug-${skillId}`,
      phase: 'runtimeUpgradeArchiving'
    });
    expect(onProgress).toHaveBeenCalledWith({
      sandboxId: `edit-debug-${skillId}`,
      phase: 'failed',
      message: SandboxErrEnum.runtimeUpgradeFailed
    });
    expect(mocks.markSandboxRuntimeUpgradeArchiveFailed).toHaveBeenCalledWith(
      archivingInstance,
      SandboxErrEnum.runtimeUpgradeFailed
    );
    expect(deleteStaleRuntimeUpgradeArchivingRecord).not.toHaveBeenCalled();
    expect(downloadSkillPackage).not.toHaveBeenCalled();
    expect(getSandboxClient).not.toHaveBeenCalled();
    expect(updateSandboxInstanceRecordBySandboxId).not.toHaveBeenCalled();
  });

  it('rejects edit-debug sandbox start without rebuilding from skill package when archived S3 package is missing', async () => {
    const skillId = 'skill-1';
    const noSuchKeyError = Object.assign(new Error('The specified key does not exist.'), {
      name: 'NoSuchKey',
      code: 'NoSuchKey'
    });
    const archivedInstance = {
      _id: 'archived-current-provider-instance',
      provider: 'test-provider',
      sandboxId: `edit-debug-${skillId}`,
      metadata: {
        archive: {
          state: 'archived'
        },
        versionId: 'version-1',
        storage: {
          key: 'storage-key'
        }
      }
    };

    vi.mocked(MongoAgentSkills.findOne).mockResolvedValueOnce({
      _id: skillId,
      name: '测试的',
      currentVersionId: 'version-1'
    } as any);
    vi.mocked(MongoAgentSkillsVersion.findOne).mockResolvedValueOnce({
      _id: 'version-1',
      storageKey: 'storage-key'
    } as any);
    vi.mocked(findSandboxInstanceBySandboxId).mockResolvedValueOnce(archivedInstance as any);
    vi.mocked(findSandboxResourcesBySourceChatTypeExcludeProvider).mockResolvedValueOnce([]);
    vi.mocked(countRunningSandboxInstancesByType).mockResolvedValueOnce(0);
    vi.mocked(getSandboxClient).mockRejectedValueOnce(noSuchKeyError);

    await expect(
      createEditDebugSandbox({
        skillId,
        teamId: 'team-1',
        tmbId: 'tmb-1'
      })
    ).rejects.toThrow(noSuchKeyError);

    expect(getSandboxClient).toHaveBeenCalledTimes(1);
    expect(deleteSandboxInstanceRecord).not.toHaveBeenCalledWith(archivedInstance._id);
    expect(mocks.deleteWorkspaceArchive).not.toHaveBeenCalled();
    expect(downloadSkillPackage).not.toHaveBeenCalled();
    expect(getReadySandboxInfo).not.toHaveBeenCalled();
    expect(updateSandboxInstanceRecordBySandboxId).not.toHaveBeenCalled();
  });

  it('drops non-archived stale-provider record locally before creating current-provider sandbox', async () => {
    const skillId = 'skill-1';
    const createError = new Error('stop after stale cleanup');
    const staleProviderInstance = {
      _id: 'stale-provider-instance',
      provider: 'sealosdevbox',
      sandboxId: `edit-debug-${skillId}`,
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: skillId,
      chatId: 'edit-debug',
      type: 'editDebug',
      metadata: {
        image: { repository: 'old-runtime', tag: 'v1' },
        versionId: 'version-1'
      }
    };

    vi.mocked(MongoAgentSkills.findOne).mockResolvedValueOnce({
      _id: skillId,
      name: '测试的',
      currentVersionId: 'version-1'
    } as any);
    vi.mocked(MongoAgentSkillsVersion.findOne).mockResolvedValueOnce({
      _id: 'version-1',
      storageKey: 'storage-key'
    } as any);
    vi.mocked(findSandboxInstanceBySandboxId).mockResolvedValueOnce(null);
    vi.mocked(findSandboxResourcesBySourceChatTypeExcludeProvider).mockResolvedValueOnce([
      staleProviderInstance as any
    ]);
    vi.mocked(getSandboxClient).mockRejectedValueOnce(createError);

    await expect(
      createEditDebugSandbox({
        skillId,
        teamId: 'team-1',
        tmbId: 'tmb-1'
      })
    ).rejects.toThrow(createError);

    expect(deleteSandboxResourceRecord).toHaveBeenCalledWith(staleProviderInstance);
    expect(getSandboxClient).toHaveBeenCalled();
    expect(mocks.archiveSandboxResourceForRuntimeUpgrade).not.toHaveBeenCalled();
    expect(downloadSkillPackage).not.toHaveBeenCalled();
  });

  it('migrates archived stale-provider edit-debug records before restoring with the new provider', async () => {
    const skillId = 'skill-1';
    const provider = {
      status: { state: 'Running' },
      execute: vi.fn(async () => ({ exitCode: 0, stdout: '', stderr: '' })),
      writeFiles: vi.fn()
    };
    const archivedStaleInstance = {
      _id: 'archived-stale-provider-instance',
      provider: 'opensandbox',
      sandboxId: `edit-debug-${skillId}`,
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: skillId,
      chatId: 'edit-debug',
      type: 'editDebug',
      metadata: {
        archive: {
          state: 'archived'
        }
      }
    };

    vi.mocked(MongoAgentSkills.findOne).mockResolvedValueOnce({
      _id: skillId,
      name: '测试的',
      currentVersionId: 'version-1'
    } as any);
    vi.mocked(MongoAgentSkillsVersion.findOne).mockResolvedValueOnce({
      _id: 'version-1',
      storageKey: 'storage-key'
    } as any);
    vi.mocked(findSandboxInstanceBySandboxId).mockResolvedValueOnce(null);
    vi.mocked(findSandboxResourcesBySourceChatTypeExcludeProvider).mockResolvedValueOnce([
      archivedStaleInstance as any
    ]);
    vi.mocked(countRunningSandboxInstancesByType).mockResolvedValueOnce(0);
    vi.mocked(migrateArchivedSandboxInstanceRecord).mockResolvedValueOnce({
      ...archivedStaleInstance,
      provider: 'test-provider'
    } as any);
    vi.mocked(getSandboxClient).mockResolvedValueOnce({
      provider,
      delete: vi.fn()
    } as any);
    vi.mocked(getReadySandboxInfo).mockResolvedValueOnce({
      image: { repository: 'test-image' },
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      status: { state: 'Running' }
    } as any);
    vi.mocked(updateSandboxInstanceRecordBySandboxId).mockResolvedValueOnce({
      _id: 'new-provider-doc'
    } as any);

    await expect(
      createEditDebugSandbox({
        skillId,
        teamId: 'team-1',
        tmbId: 'tmb-1'
      })
    ).resolves.toMatchObject({
      sandboxId: `edit-debug-${skillId}`,
      status: { state: 'Running' }
    });

    expect(migrateArchivedSandboxInstanceRecord).toHaveBeenCalledWith({
      source: archivedStaleInstance,
      provider: 'test-provider',
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: skillId,
      userId: '',
      chatId: 'edit-debug',
      type: 'edit-debug'
    });
    expect(mocks.deleteWorkspaceArchive).not.toHaveBeenCalled();
    expect(downloadSkillPackage).not.toHaveBeenCalled();
    expect(provider.writeFiles).not.toHaveBeenCalled();
    expect(updateSandboxInstanceRecordBySandboxId).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'test-provider',
        sandboxId: `edit-debug-${skillId}`,
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: skillId,
        chatId: 'edit-debug'
      })
    );
  });
});
