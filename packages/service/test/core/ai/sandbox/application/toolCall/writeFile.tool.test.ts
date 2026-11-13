import { describe, expect, it, vi } from 'vitest';
import { sandboxWriteFileTool } from '@fastgpt/service/core/ai/sandbox/application/toolCall/writeFile.tool';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

const createSandboxInstance = () => {
  const ensureAvailable = vi.fn(async () => undefined);
  return {
    ensureAvailable,
    runWithRecovery: vi.fn(async (fn: () => Promise<unknown>) => {
      await ensureAvailable();
      return fn();
    }),
    resolveRuntimePath: vi.fn((path: string) => path),
    opensandbox: {
      writeFiles: vi.fn(async () => undefined)
    }
  } as any;
};

describe('sandboxWriteFileTool', () => {
  it('writes files through opensandbox', async () => {
    const sandbox = createSandboxInstance();

    await expect(
      sandboxWriteFileTool.execute({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app',
        userId: 'user',
        chatId: 'chat',
        sandboxInstance: sandbox,
        params: { path: '/workspace/a.txt', content: 'hello' }
      })
    ).resolves.toEqual({ response: 'File written successfully: /workspace/a.txt' });

    expect(sandbox.ensureAvailable).toHaveBeenCalledTimes(1);
    expect(sandbox.opensandbox.writeFiles).toHaveBeenCalledWith([
      { path: '/workspace/a.txt', data: 'hello' }
    ]);
  });

  it('propagates write failures', async () => {
    const sandbox = createSandboxInstance();
    sandbox.opensandbox.writeFiles.mockRejectedValueOnce(new Error('disk is full'));

    await expect(
      sandboxWriteFileTool.execute({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app',
        userId: 'user',
        chatId: 'chat',
        sandboxInstance: sandbox,
        params: { path: '/workspace/a.txt', content: 'hello' }
      })
    ).rejects.toThrow('disk is full');
  });
});
