import { describe, expect, it, vi } from 'vitest';
import { sandboxEditFileTool } from '@fastgpt/service/core/ai/sandbox/application/toolCall/editFile.tool';
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
      replaceContent: vi.fn(async () => undefined)
    }
  } as any;
};

describe('sandboxEditFileTool', () => {
  it('edits files through the provider', async () => {
    const sandbox = createSandboxInstance();

    await expect(
      sandboxEditFileTool.execute({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app',
        userId: 'user',
        chatId: 'chat',
        sandboxInstance: sandbox,
        params: {
          entries: [{ path: '/workspace/a.txt', oldContent: 'old', newContent: 'new' }]
        }
      })
    ).resolves.toEqual({ response: 'Files edited successfully: /workspace/a.txt' });

    expect(sandbox.ensureAvailable).toHaveBeenCalledTimes(1);
    expect(sandbox.opensandbox.replaceContent).toHaveBeenCalledWith([
      { path: '/workspace/a.txt', oldContent: 'old', newContent: 'new' }
    ]);
  });
});
