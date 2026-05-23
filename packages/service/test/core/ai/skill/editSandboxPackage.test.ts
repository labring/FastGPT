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
  extractNormalizedSkillPackageFilesForSandbox: vi.fn()
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
    shellQuote: (value: string) => `'${value.replace(/'/g, `'\\''`)}'`
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
import {
  downloadSkillPackage,
  extractNormalizedSkillPackageFilesForSandbox
} from '@fastgpt/service/core/ai/skill/package';
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
      if (command.startsWith('find ')) {
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
    readFiles: vi.fn(async () => readFilesResult)
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
});

describe('createEditDebugSandbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes extracted files directly so Chinese skill directory names are preserved', async () => {
    const packageBuffer = Buffer.from('zip');
    const skillId = 'skill-1';
    const provider = {
      status: { state: 'Running' },
      execute: vi.fn(async (command: string) => {
        if (command === "mkdir -p '/workspace'") {
          return { exitCode: 0, stdout: '', stderr: '' };
        }
        if (
          command ===
          "rm -rf '/workspace/skills' && mkdir -p '/workspace/skills' '/workspace/skills/测试的'"
        ) {
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
    vi.mocked(extractNormalizedSkillPackageFilesForSandbox).mockResolvedValueOnce([
      {
        path: '测试的/SKILL.md',
        data: Buffer.from('---\nname: 测试的\n---')
      }
    ]);
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
        path: '/workspace/skills/测试的/SKILL.md',
        data: Buffer.from('---\nname: 测试的\n---')
      }
    ]);
    expect(provider.execute).not.toHaveBeenCalledWith(expect.stringContaining('unzip'));
    expect(mocks.disconnectSandbox).toHaveBeenCalledWith(provider);
  });
});
