import { describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { sandboxLsTool } from '@fastgpt/service/core/ai/sandbox/application/toolCall/ls.tool';

const createSandboxInstance = () =>
  ({
    ensureAvailable: vi.fn(async () => undefined),
    provider: {
      listDirectory: vi.fn(async () => [
        { name: 'src', isDirectory: true },
        { name: '.env', isDirectory: false },
        { name: 'README.md', isDirectory: false }
      ])
    }
  }) as any;

describe('sandboxLsTool', () => {
  it('sorts entries, preserves dotfiles, and marks directories', async () => {
    const sandbox = createSandboxInstance();

    const result = await sandboxLsTool.execute({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app',
      userId: 'user',
      chatId: 'chat',
      sandboxInstance: sandbox,
      params: { path: '/workspace' }
    });

    expect(result.response).toBe('.env\nREADME.md\nsrc/');
    expect(sandbox.ensureAvailable).toHaveBeenCalledTimes(1);
    expect(sandbox.provider.listDirectory).toHaveBeenCalledWith('/workspace');
  });

  it('returns a stable empty directory result', async () => {
    const sandbox = createSandboxInstance();
    sandbox.provider.listDirectory.mockResolvedValueOnce([]);

    await expect(
      sandboxLsTool.execute({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app',
        userId: 'user',
        chatId: 'chat',
        sandboxInstance: sandbox,
        params: {}
      })
    ).resolves.toEqual({ response: '(empty directory)' });
    expect(sandbox.provider.listDirectory).toHaveBeenCalledWith('.');
  });

  it('reports when the entry limit is reached', async () => {
    const sandbox = createSandboxInstance();

    const result = await sandboxLsTool.execute({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app',
      userId: 'user',
      chatId: 'chat',
      sandboxInstance: sandbox,
      params: { limit: 1 }
    });

    expect(result.response).toBe('.env\n\n[1 entries limit reached. Use limit=2 for more]');
  });
});
