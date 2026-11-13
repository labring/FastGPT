import { describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { sandboxLsTool } from '@fastgpt/service/core/ai/sandbox/application/toolCall/ls.tool';

const createSandboxInstance = () => {
  const ensureAvailable = vi.fn(async () => undefined);
  return {
    ensureAvailable,
    runWithRecovery: vi.fn(async (fn: () => Promise<unknown>) => {
      await ensureAvailable();
      return fn();
    }),
    getRuntimePaths: vi.fn(() => ({
      workspaceRoot: '/workspace',
      runtimeSkillsRoot: '/workspace/projects',
      sessionWorkDirectory: '/workspace/sessions/chat'
    })),
    resolveRuntimePath: vi.fn((path?: string) => {
      if (!path || path === '.') return '/workspace/sessions/chat';
      if (path.startsWith('/')) return path;
      return `/workspace/sessions/chat/${path}`;
    }),
    opensandbox: {
      listDirectory: vi.fn(async () => [
        { path: '/workspace/.fastgpt', type: 'directory' },
        { path: '/workspace/src', type: 'directory' },
        { path: '/workspace/.env', type: 'file' },
        { path: '/workspace/README.md', type: 'file' }
      ])
    }
  } as any;
};

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
    expect(sandbox.resolveRuntimePath).toHaveBeenCalledWith('/workspace', {
      allowAbsolutePath: true
    });
    expect(sandbox.opensandbox.listDirectory).toHaveBeenCalledWith('/workspace');
  });

  it('returns a stable empty directory result', async () => {
    const sandbox = createSandboxInstance();
    sandbox.opensandbox.listDirectory.mockResolvedValueOnce([]);

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
    expect(sandbox.resolveRuntimePath).toHaveBeenCalledWith(undefined, {
      allowAbsolutePath: true
    });
    expect(sandbox.opensandbox.listDirectory).toHaveBeenCalledWith('/workspace/sessions/chat');
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
