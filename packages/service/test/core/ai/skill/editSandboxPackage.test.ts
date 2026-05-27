import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connectToSandbox: vi.fn(),
  disconnectSandbox: vi.fn(),
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
  DEFAULT_GITIGNORE_CONTENT: '# mock gitignore'
}));

vi.mock('@fastgpt/service/core/ai/skill/sandbox/config', () => ({
  getSkillSizeLimits: () => ({
    maxUploadBytes: 1024 * 1024,
    maxUncompressedBytes: 1024 * 1024,
    maxDownloadBytes: 1024 * 1024,
    maxSandboxPackageBytes: 1024 * 1024
  })
}));

vi.mock('@fastgpt/service/core/ai/skill/edit/config', () => ({
  EDIT_DEBUG_SANDBOX_CHAT_ID: 'edit-debug',
  getEditDebugSandboxId: (skillId: string) => `edit-debug-${skillId}`
}));

vi.mock('@fastgpt/service/core/ai/sandbox/provider/config', () => ({
  getSandboxProviderConfig: () => ({
    provider: 'test-provider'
  }),
  validateSandboxConfig: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/sandbox/runtime/profile', () => ({
  buildBaseSandboxRuntimeEnv: vi.fn(() => ({
    FASTGPT_WORKDIR: '/workspace'
  })),
  getSandboxRuntimeProfile: () => ({
    provider: 'opensandbox',
    workDirectory: '/workspace',
    skillsRootPath: '/workspace/skills',
    defaultImage: 'test-image',
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

vi.mock('@fastgpt/service/core/ai/sandbox/service/runtime', () => ({
  getSandboxClient: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/sandbox/service/resource', () => ({
  deleteSandboxResource: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/sandbox/instance/repository', () => ({
  countRunningSandboxInstancesByType: vi.fn(),
  deleteSandboxInstanceRecord: vi.fn(),
  findSandboxInstanceByAppChatType: vi.fn(),
  findSandboxResourcesByAppChatTypeExcludeProvider: vi.fn(),
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

vi.mock('@fastgpt/service/env', () => ({
  serviceEnv: {}
}));

vi.mock('@fastgpt/service/support/permission/teamLimit', () => ({
  checkTeamSandboxPermission: vi.fn()
}));

import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { MongoAgentSkillsVersion } from '@fastgpt/service/core/ai/skill/version/schema';
import { downloadSkillPackage } from '@fastgpt/service/core/ai/skill/package';
import {
  createEditDebugSandbox,
  packageSkillInSandbox
} from '@fastgpt/service/core/ai/skill/edit/sandbox';
import { getReadySandboxInfo } from '@fastgpt/service/core/ai/sandbox/provider/lifecycle';
import { getSandboxClient } from '@fastgpt/service/core/ai/sandbox/service/runtime';
import {
  countRunningSandboxInstancesByType,
  findSandboxInstanceByAppChatType,
  findSandboxResourcesByAppChatTypeExcludeProvider,
  updateSandboxInstanceRecordBySandboxId
} from '@fastgpt/service/core/ai/sandbox/instance/repository';

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
      if (command.includes(" -name '.gitignore'")) {
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
        if (command.includes(" -name '.gitignore'")) {
          return { exitCode: 0, stdout: '/workspace/.gitignore\n', stderr: '' };
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
});

describe('createEditDebugSandbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
        if (command === "rm -rf '/workspace/skills' && mkdir -p '/workspace/skills'") {
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
    expect(provider.execute).toHaveBeenCalledWith(expect.stringContaining('unzip'));
    expect(mocks.disconnectSandbox).toHaveBeenCalledWith(provider);
  });
});
