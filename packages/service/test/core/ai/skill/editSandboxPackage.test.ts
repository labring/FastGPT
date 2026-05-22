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
  downloadSkillPackage: vi.fn()
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
  getEditDebugSandboxId: (skillId: string) => `edit-debug-${skillId}`,
  buildEditDebugCreateConfig: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/sandbox/provider/config', () => ({
  getSandboxProviderConfig: () => ({
    provider: 'test-provider'
  }),
  validateSandboxConfig: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/sandbox/runtime/config', () => ({
  getSandboxDefaults: () => ({
    workDirectory: '/workspace',
    defaultImage: 'test-image',
    entrypoint: 'sleep infinity'
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

import { packageSkillInSandbox } from '@fastgpt/service/core/ai/skill/edit/sandbox';

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
