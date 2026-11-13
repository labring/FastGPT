import { describe, expect, it, vi } from 'vitest';
import { emptyWorkDirectory } from '@fastgpt/service/core/ai/sandbox/application/runtime/prepare';

const file = (name: string) => ({
  path: `/workspace/session/${name}`,
  type: 'file' as const
});

const directory = (name: string) => ({
  path: `/workspace/session/${name}`,
  type: 'directory' as const
});

const createContext = () => {
  const sandbox = {
    listDirectory: vi.fn(async () => [file('.env'), directory('.fastgpt'), directory('src')]),
    deleteFiles: vi.fn(async () => undefined),
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
    sandbox.deleteFiles.mockRejectedValueOnce(new Error('permission denied'));

    await expect(emptyWorkDirectory()(context)).rejects.toThrow('permission denied');
    expect(sandbox.deleteDirectories).not.toHaveBeenCalled();
  });
});
