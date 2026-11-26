import { describe, expect, it, vi } from 'vitest';
import { sandboxWriteFileTool } from '@fastgpt/service/core/ai/sandbox/application/toolCall/writeFile.tool';
import { createToolRunner } from '@fastgpt/service/core/ai/sandbox/application/toolCall/type';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

const createSandboxInstance = () =>
  ({
    ensureAvailable: vi.fn(async () => undefined),
    runWithRecovery: vi.fn(async (fn: () => Promise<unknown>) => fn()),
    resolveRuntimePath: vi.fn((path: string) => path),
    opensandbox: {
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
  it('writes files through createToolRunner inside runWithRecovery', async () => {
    const sandbox = createSandboxInstance();

    await expect(
      createToolRunner(sandboxWriteFileTool)({
        sandboxInstance: sandbox,
        input: { path: '/workspace/a.txt', content: 'hello' }
      })
    ).resolves.toEqual({
      success: true,
      input: { path: '/workspace/a.txt', content: 'hello' },
      response: 'File written successfully: /workspace/a.txt'
    });

    expect(sandbox.runWithRecovery).toHaveBeenCalledWith(expect.any(Function), undefined);
    expect(sandbox.ensureAvailable).not.toHaveBeenCalled();
    expect(sandbox.opensandbox.writeFiles).toHaveBeenCalledWith([
      { path: '/workspace/a.txt', data: 'hello' }
    ]);
  });

  it('throws when the provider reports a write failure', async () => {
    const sandbox = createSandboxInstance();
    sandbox.opensandbox.writeFiles.mockResolvedValueOnce([
      {
        path: '/workspace/a.txt',
        bytesWritten: 0,
        error: new Error('disk is full')
      }
    ]);

    await expect(
      sandboxWriteFileTool.execute({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app',
        userId: 'user',
        chatId: 'chat',
        sandboxInstance: sandbox,
        params: { path: '/workspace/a.txt', content: 'hello' }
      })
    ).rejects.toThrow('Failed to write file: disk is full');
  });

  it('throws when the provider returns no write result', async () => {
    const sandbox = createSandboxInstance();
    sandbox.opensandbox.writeFiles.mockResolvedValueOnce([]);

    await expect(
      sandboxWriteFileTool.execute({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app',
        userId: 'user',
        chatId: 'chat',
        sandboxInstance: sandbox,
        params: { path: '/workspace/a.txt', content: 'hello' }
      })
    ).rejects.toThrow('Failed to write file: /workspace/a.txt');
  });
});
