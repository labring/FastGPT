import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connectToSandbox: vi.fn(),
  disconnectSandbox: vi.fn(),
  deleteWorkspaceArchive: vi.fn(),
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
  getSandboxAdapterConfig: vi.fn((opts) => ({
    providerConfig: {
      provider: opts.provider || 'test-provider'
    },
    createConfig: opts.createConfig
  }))
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

vi.mock('@fastgpt/service/core/ai/sandbox/service/resource', () => ({
  deleteSandboxResource: vi.fn()
}));

vi.mock('@fastgpt/service/common/s3/sources/sandbox', () => ({
  getS3SandboxSource: () => ({
    deleteWorkspaceArchive: mocks.deleteWorkspaceArchive
  })
}));

vi.mock('@fastgpt/service/core/ai/sandbox/instance/repository', () => ({
  countRunningSandboxInstancesByType: vi.fn(),
  deleteSandboxInstanceRecord: vi.fn(),
  findSandboxInstanceByAppChatType: vi.fn(),
  findSandboxResourcesByAppChatTypeExcludeProvider: vi.fn(),
  migrateArchivedSandboxInstanceRecord: vi.fn(),
  updateSandboxInstanceRecordBySandboxId: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/skill/runtime', () => {
  const trimSandboxPathRight = (value: string) => (value === '/' ? '' : value.replace(/\/+$/, ''));

  return {
    getSkillsRootPath: (workDirectory: string) => `${trimSandboxPathRight(workDirectory)}/skills`,
    joinSandboxPath: (basePath: string, path: string) =>
      `${trimSandboxPathRight(basePath)}/${path}`,
    shellQuote: (value: string) => `'${value.replace(/'/g, `'\\''`)}'`,
    getSafeSkillDirectoryName: (name: string) => name
  };
});

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
import { downloadSkillPackage, validateZipStructure } from '@fastgpt/service/core/ai/skill/package';
import {
  createEditDebugSandbox,
  packageSkillInSandbox
} from '@fastgpt/service/core/ai/skill/edit/sandbox';
import { getReadySandboxInfo } from '@fastgpt/service/core/ai/sandbox/provider/lifecycle';
import { buildSandboxAdapter } from '@fastgpt/service/core/ai/sandbox/provider/adapter';
import { getSandboxClient } from '@fastgpt/service/core/ai/sandbox/service/runtime';
import { deleteSandboxResource } from '@fastgpt/service/core/ai/sandbox/service/resource';
import {
  countRunningSandboxInstancesByType,
  deleteSandboxInstanceRecord,
  findSandboxInstanceByAppChatType,
  findSandboxResourcesByAppChatTypeExcludeProvider,
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
      if (paths.includes('/workspace/package.zip')) {
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
          path: '/workspace/package.zip',
          content: zipContent,
          error: null
        }
      ]
    });
    mocks.connectToSandbox.mockResolvedValueOnce(sandbox);

    await expect(packageSkillInSandbox({ sandboxId: 'sandbox-1' })).resolves.toEqual(
      Buffer.from(zipContent)
    );

    expect(sandbox.readFiles).toHaveBeenCalledWith(['/workspace/package.zip']);
    expect(sandbox.execute).toHaveBeenCalledWith("rm -f '/workspace/package.zip'");
    expect(validateZipStructure).toHaveBeenCalledWith(Buffer.from(zipContent), {
      maxUncompressedBytes: 1024 * 1024
    });
    expect(mocks.disconnectSandbox).toHaveBeenCalledWith(sandbox);
  });

  it('throws when the final package zip exceeds the skill package limit', async () => {
    const zipContent = new Uint8Array(1024 * 1024 + 1);
    const sandbox = createSandbox({
      readFilesResult: [
        {
          path: '/workspace/package.zip',
          content: zipContent,
          error: null
        }
      ]
    });
    mocks.connectToSandbox.mockResolvedValueOnce(sandbox);

    await expect(packageSkillInSandbox({ sandboxId: 'sandbox-1' })).rejects.toThrow(
      'Skill package size'
    );

    expect(validateZipStructure).not.toHaveBeenCalled();
    expect(sandbox.execute).toHaveBeenCalledWith("rm -f '/workspace/package.zip'");
    expect(mocks.disconnectSandbox).toHaveBeenCalledWith(sandbox);
  });

  it('throws when the package zip read reports an error', async () => {
    const sandbox = createSandbox({
      readFilesResult: [
        {
          path: '/workspace/package.zip',
          content: new Uint8Array(),
          error: new Error('read failed')
        }
      ]
    });
    mocks.connectToSandbox.mockResolvedValueOnce(sandbox);

    await expect(packageSkillInSandbox({ sandboxId: 'sandbox-1' })).rejects.toThrow(
      'Failed to read package file in sandbox: read failed'
    );

    expect(sandbox.execute).toHaveBeenCalledWith("rm -f '/workspace/package.zip'");
    expect(mocks.disconnectSandbox).toHaveBeenCalledWith(sandbox);
  });

  it('reads and parses custom .gitignore files from the sandbox correctly', async () => {
    const gitignoreContent = `
# ignore node and env
my_custom_ignored_dir/
temp_data.csv
`;
    const zipContent = new Uint8Array([9, 8, 7]);
    const sandbox = {
      execute: vi.fn(async (command: string) => {
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
        if (paths.includes('/workspace/package.zip')) {
          return [{ path: '/workspace/package.zip', content: zipContent, error: null }];
        }
        return [];
      })
    };
    mocks.connectToSandbox.mockResolvedValueOnce(sandbox);

    await expect(packageSkillInSandbox({ sandboxId: 'sandbox-1' })).resolves.toEqual(
      Buffer.from(zipContent)
    );

    // Verify .gitignore was read
    expect(sandbox.readFiles).toHaveBeenCalledWith(['/workspace/.gitignore']);
    // Verify zip was called with custom excludes
    expect(sandbox.execute).toHaveBeenCalledWith(
      expect.stringContaining("-x 'my_custom_ignored_dir/*'")
    );
    expect(sandbox.execute).toHaveBeenCalledWith(
      expect.stringContaining("-x '*/my_custom_ignored_dir/*'")
    );
    expect(sandbox.execute).toHaveBeenCalledWith(expect.stringContaining("-x 'temp_data.csv'"));
  });

  it('applies default ignore rules when packaging without workspace gitignore', async () => {
    const zipContent = new Uint8Array([1, 2, 3]);
    const sandbox = createSandbox({
      readFilesResult: [
        {
          path: '/workspace/package.zip',
          content: zipContent,
          error: null
        }
      ]
    });
    mocks.connectToSandbox.mockResolvedValueOnce(sandbox);

    await expect(packageSkillInSandbox({ sandboxId: 'sandbox-1' })).resolves.toEqual(
      Buffer.from(zipContent)
    );

    expect(sandbox.execute).toHaveBeenCalledWith(
      expect.stringContaining("-name '.venv' -o -name 'node_modules'")
    );
    expect(sandbox.execute).toHaveBeenCalledWith(expect.stringContaining("-x '.venv/*'"));
    expect(sandbox.execute).toHaveBeenCalledWith(expect.stringContaining("-x '*/.venv/*'"));
  });

  it('only reads root gitignore when packaging', async () => {
    const rootGitignoreContent = 'dist/\n';
    const zipContent = new Uint8Array([1, 2, 3]);
    const sandbox = {
      execute: vi.fn(async (command: string) => {
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
        if (paths.includes('/workspace/package.zip')) {
          return [{ path: '/workspace/package.zip', content: zipContent, error: null }];
        }
        if (paths.includes('/workspace/.gitignore')) {
          return [{ path: '/workspace/.gitignore', content: rootGitignoreContent, error: null }];
        }
        return [];
      })
    };
    mocks.connectToSandbox.mockResolvedValueOnce(sandbox);

    await expect(packageSkillInSandbox({ sandboxId: 'sandbox-1' })).resolves.toEqual(
      Buffer.from(zipContent)
    );

    expect(sandbox.readFiles).toHaveBeenCalledWith(['/workspace/.gitignore']);
    expect(sandbox.readFiles).not.toHaveBeenCalledWith(['/workspace/.venv/.gitignore']);
    expect(sandbox.execute).toHaveBeenCalledWith(expect.stringContaining("-x 'dist/*'"));
  });
});

describe('createEditDebugSandbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkTeamSandboxPermission).mockResolvedValue(undefined);
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

    vi.mocked(MongoAgentSkills.findOne).mockResolvedValueOnce({
      _id: skillId,
      name: '测试的',
      currentVersionId: 'version-1'
    } as any);
    vi.mocked(MongoAgentSkillsVersion.findOne).mockResolvedValueOnce({
      _id: 'version-1',
      storageKey: 'storage-key'
    } as any);
    vi.mocked(findSandboxInstanceByAppChatType).mockResolvedValueOnce(null);
    vi.mocked(findSandboxResourcesByAppChatTypeExcludeProvider).mockResolvedValueOnce([]);
    vi.mocked(countRunningSandboxInstancesByType).mockResolvedValueOnce(0);
    vi.mocked(downloadSkillPackage).mockResolvedValueOnce(packageBuffer);
    vi.mocked(getSandboxClient).mockResolvedValueOnce({
      provider,
      delete: vi.fn()
    } as any);
    vi.mocked(getReadySandboxInfo).mockResolvedValueOnce({
      image: 'test-image',
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
    vi.mocked(findSandboxInstanceByAppChatType).mockResolvedValueOnce(archivedInstance as any);
    vi.mocked(findSandboxResourcesByAppChatTypeExcludeProvider).mockResolvedValueOnce([]);
    vi.mocked(countRunningSandboxInstancesByType).mockResolvedValueOnce(0);
    vi.mocked(getSandboxClient).mockResolvedValueOnce({
      provider,
      delete: vi.fn()
    } as any);
    vi.mocked(getReadySandboxInfo).mockResolvedValueOnce({
      image: 'test-image',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      status: { state: 'Running' }
    } as any);
    vi.mocked(updateSandboxInstanceRecordBySandboxId).mockResolvedValueOnce({
      _id: 'doc-restored'
    } as any);

    const { connectReadySandboxByInstance } =
      await import('@fastgpt/service/core/ai/sandbox/provider/lifecycle');

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
    expect(deleteSandboxResource).not.toHaveBeenCalled();
    expect(deleteSandboxInstanceRecord).not.toHaveBeenCalled();
    expect(getSandboxClient).toHaveBeenCalledWith(
      {
        appId: skillId,
        userId: '',
        chatId: 'edit-debug'
      },
      expect.objectContaining({
        createConfig: expect.any(Object)
      })
    );
    expect(downloadSkillPackage).not.toHaveBeenCalled();
  });

  it('rebuilds edit-debug sandbox from skill package when archived S3 package is missing', async () => {
    const skillId = 'skill-1';
    const packageBuffer = Buffer.from('zip');
    const noSuchKeyError = Object.assign(new Error('The specified key does not exist.'), {
      name: 'NoSuchKey',
      code: 'NoSuchKey'
    });
    const provider = {
      status: { state: 'Running' },
      execute: vi.fn(async () => ({ exitCode: 0, stdout: '', stderr: '' })),
      writeFiles: vi.fn(async (entries: Array<{ path: string; data: Buffer }>) =>
        entries.map((entry) => ({
          path: entry.path,
          bytesWritten: entry.data.length,
          error: null
        }))
      )
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
    vi.mocked(findSandboxInstanceByAppChatType).mockResolvedValueOnce(archivedInstance as any);
    vi.mocked(findSandboxResourcesByAppChatTypeExcludeProvider).mockResolvedValueOnce([]);
    vi.mocked(countRunningSandboxInstancesByType).mockResolvedValueOnce(0);
    vi.mocked(getSandboxClient)
      .mockRejectedValueOnce(noSuchKeyError)
      .mockResolvedValueOnce({
        provider,
        delete: vi.fn()
      } as any);
    vi.mocked(downloadSkillPackage).mockResolvedValueOnce(packageBuffer);
    vi.mocked(getReadySandboxInfo).mockResolvedValueOnce({
      image: 'test-image',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      status: { state: 'Running' }
    } as any);
    vi.mocked(updateSandboxInstanceRecordBySandboxId).mockResolvedValueOnce({
      _id: 'rebuilt-doc'
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

    expect(getSandboxClient).toHaveBeenCalledTimes(2);
    expect(deleteSandboxInstanceRecord).toHaveBeenCalledWith(archivedInstance._id);
    expect(deleteSandboxResource).not.toHaveBeenCalled();
    expect(mocks.deleteWorkspaceArchive).not.toHaveBeenCalled();
    expect(downloadSkillPackage).toHaveBeenCalledWith({
      storageKey: 'storage-key'
    });
    expect(provider.writeFiles).toHaveBeenCalledWith([
      {
        path: '/workspace/skills/package.zip',
        data: packageBuffer
      }
    ]);
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
      appId: skillId,
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
    vi.mocked(findSandboxInstanceByAppChatType).mockResolvedValueOnce(null);
    vi.mocked(findSandboxResourcesByAppChatTypeExcludeProvider).mockResolvedValueOnce([
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
      image: 'test-image',
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
      appId: skillId,
      userId: '',
      chatId: 'edit-debug',
      type: 'edit-debug'
    });
    expect(deleteSandboxResource).not.toHaveBeenCalledWith(archivedStaleInstance);
    expect(mocks.deleteWorkspaceArchive).not.toHaveBeenCalled();
    expect(downloadSkillPackage).not.toHaveBeenCalled();
    expect(provider.writeFiles).not.toHaveBeenCalled();
    expect(updateSandboxInstanceRecordBySandboxId).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'test-provider',
        sandboxId: `edit-debug-${skillId}`,
        appId: skillId,
        chatId: 'edit-debug'
      })
    );
  });
});
