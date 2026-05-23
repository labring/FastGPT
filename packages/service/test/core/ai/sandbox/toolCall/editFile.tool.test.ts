import { describe, expect, it, vi } from 'vitest';
import { sandboxEditFileTool } from '@fastgpt/service/core/ai/sandbox/toolCall/editFile.tool';

const createSandboxInstance = () =>
  ({
    ensureAvailable: vi.fn(async () => undefined),
    provider: {
      replaceContent: vi.fn(async () => undefined)
    }
  }) as any;

describe('sandboxEditFileTool', () => {
  it('edits files through the provider', async () => {
    const sandbox = createSandboxInstance();

    await expect(
      sandboxEditFileTool.execute({
        appId: 'app',
        userId: 'user',
        chatId: 'chat',
        sandboxInstance: sandbox,
        params: {
          entries: [{ path: '/workspace/a.txt', oldContent: 'old', newContent: 'new' }]
        }
      })
    ).resolves.toEqual({ response: 'Files edited successfully: /workspace/a.txt' });

    expect(sandbox.ensureAvailable).toHaveBeenCalledTimes(1);
    expect(sandbox.provider.replaceContent).toHaveBeenCalledWith([
      { path: '/workspace/a.txt', oldContent: 'old', newContent: 'new' }
    ]);
  });
});
