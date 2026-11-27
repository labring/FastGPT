import { describe, expect, it, vi } from 'vitest';
import { SandboxErrEnum } from '@fastgpt/global/common/error/code/sandbox';
import { UserError } from '@fastgpt/global/common/error/utils';
import {
  emptyWorkDirectory,
  prepareWorkDirectory
} from '@fastgpt/service/core/ai/sandbox/application/runtime/prepare';

const file = (name: string) => ({
  name,
  path: `/workspace/session/${name}`,
  isDirectory: false,
  isFile: true
});

const directory = (name: string) => ({
  name,
  path: `/workspace/session/${name}`,
  isDirectory: true,
  isFile: false
});

const createContext = () => {
  const sandbox = {
    listDirectory: vi.fn(async () => [file('.env'), directory('src')]),
    deleteFiles: vi.fn(
      async (
        paths: string[]
      ): Promise<Array<{ path: string; success: boolean; error: Error | null }>> =>
        paths.map((path) => ({ path, success: true, error: null }))
    ),
    deleteDirectories: vi.fn(async () => undefined)
  };

  return {
    sandbox,
    context: {
      sandbox: sandbox as any,
      workDirectory: '/workspace/session'
    }
  };
};

describe('sandbox runtime prepare', () => {
  it('deletes all direct children while preserving the work directory itself', async () => {
    const { sandbox, context } = createContext();
    sandbox.listDirectory.mockResolvedValueOnce([
      file('.env'),
      directory('src'),
      directory('.fastgpt')
    ]);

    await emptyWorkDirectory()(context);

    expect(sandbox.deleteFiles).toHaveBeenCalledWith(['/workspace/session/.env']);
    expect(sandbox.deleteDirectories).toHaveBeenCalledWith([
      '/workspace/session/src',
      '/workspace/session/.fastgpt'
    ]);
  });

  it('stops before deleting directories when a file deletion fails', async () => {
    const { sandbox, context } = createContext();
    sandbox.deleteFiles.mockResolvedValueOnce([
      {
        path: '/workspace/session/.env',
        success: false,
        error: new Error('permission denied')
      }
    ]);

    await expect(emptyWorkDirectory()(context)).rejects.toThrow(
      'Failed to clean workspace file /workspace/session/.env: permission denied'
    );
    expect(sandbox.deleteDirectories).not.toHaveBeenCalled();
  });

  it('maps ENOSPC from prepareWorkDirectory to agentSandboxDiskQuotaExceeded', async () => {
    const sandbox = {
      createDirectories: vi
        .fn()
        .mockRejectedValueOnce(new Error('mkdir /workspace/sessions/chat: no space left on device'))
    };

    await expect(
      prepareWorkDirectory()({
        sandbox: sandbox as any,
        workDirectory: '/workspace/sessions/chat'
      })
    ).rejects.toThrowError(new UserError(SandboxErrEnum.agentSandboxDiskQuotaExceeded));
  });
});
