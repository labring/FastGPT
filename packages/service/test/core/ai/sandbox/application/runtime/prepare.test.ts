import { describe, expect, it, vi } from 'vitest';
import { emptyWorkDirectory } from '@fastgpt/service/core/ai/sandbox/application/runtime/prepare';

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
  it('deletes direct children while preserving the work directory', async () => {
    const { sandbox, context } = createContext();

    await emptyWorkDirectory()(context);

    expect(sandbox.deleteFiles).toHaveBeenCalledWith(['/workspace/session/.env']);
    expect(sandbox.deleteDirectories).toHaveBeenCalledWith(['/workspace/session/src']);
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
});
