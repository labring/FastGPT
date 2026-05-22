import { describe, expect, it, vi } from 'vitest';
import { sandboxWriteFileTool } from '@fastgpt/service/core/ai/sandbox/toolCall/writeFile.tool';

const createSandboxInstance = () =>
  ({
    ensureAvailable: vi.fn(async () => undefined),
    provider: {
      writeFiles: vi.fn(async (files: { path: string; data: string }[]) =>
        files.map((file) => ({
          path: file.path,
          bytesWritten: Buffer.byteLength(file.data),
          error: null
        }))
      )
    }
  }) as any;

describe('sandboxWriteFileTool', () => {
  it('writes files through the provider', async () => {
    const sandbox = createSandboxInstance();

    await expect(
      sandboxWriteFileTool.execute({
        appId: 'app',
        userId: 'user',
        chatId: 'chat',
        sandboxInstance: sandbox,
        params: { path: '/workspace/a.txt', content: 'hello' }
      })
    ).resolves.toEqual({ response: 'File written successfully: /workspace/a.txt' });

    expect(sandbox.ensureAvailable).toHaveBeenCalledTimes(1);
    expect(sandbox.provider.writeFiles).toHaveBeenCalledWith([
      { path: '/workspace/a.txt', data: 'hello' }
    ]);
  });

  it('throws when the provider reports a write failure', async () => {
    const sandbox = createSandboxInstance();
    sandbox.provider.writeFiles.mockResolvedValueOnce([
      {
        path: '/workspace/a.txt',
        bytesWritten: 0,
        error: new Error('disk is full')
      }
    ]);

    await expect(
      sandboxWriteFileTool.execute({
        appId: 'app',
        userId: 'user',
        chatId: 'chat',
        sandboxInstance: sandbox,
        params: { path: '/workspace/a.txt', content: 'hello' }
      })
    ).rejects.toThrow('Failed to write file: disk is full');
  });

  it('throws when the provider returns no write result', async () => {
    const sandbox = createSandboxInstance();
    sandbox.provider.writeFiles.mockResolvedValueOnce([]);

    await expect(
      sandboxWriteFileTool.execute({
        appId: 'app',
        userId: 'user',
        chatId: 'chat',
        sandboxInstance: sandbox,
        params: { path: '/workspace/a.txt', content: 'hello' }
      })
    ).rejects.toThrow('Failed to write file: /workspace/a.txt');
  });
});
