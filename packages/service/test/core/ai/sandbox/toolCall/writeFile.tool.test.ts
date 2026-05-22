import { describe, expect, it, vi } from 'vitest';
import { sandboxWriteFileTool } from '@fastgpt/service/core/ai/sandbox/toolCall/writeFile.tool';

const createSandboxInstance = () =>
  ({
    ensureAvailable: vi.fn(async () => undefined),
    provider: {
      writeFiles: vi.fn(async () => undefined)
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
});
