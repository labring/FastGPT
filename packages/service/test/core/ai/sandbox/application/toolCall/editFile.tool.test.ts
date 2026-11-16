import { describe, expect, it, vi } from 'vitest';
import { sandboxEditFileTool } from '@fastgpt/service/core/ai/sandbox/application/toolCall/editFile.tool';
import { raceToolWithStopGrace } from '@fastgpt/service/core/ai/llm/agentLoop/domain/stopGrace';
import { STOPPED_TOOL_RESPONSE_TEXT } from '@fastgpt/service/core/chat/stop';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

const createSandboxInstance = () =>
  ({
    ensureAvailable: vi.fn(async () => undefined),
    resolveRuntimePath: vi.fn((path: string) => path),
    provider: {
      replaceContent: vi.fn(async () => undefined)
    }
  }) as any;

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
    expect(sandbox.provider.replaceContent).toHaveBeenCalledWith([
      { path: '/workspace/a.txt', oldContent: 'old', newContent: 'new' }
    ]);
  });

  it('does not invoke provider.replaceContent when aborted during ensureAvailable and resumed after stop grace', async () => {
    const sandbox = createSandboxInstance();
    const ensureDeferred = Promise.withResolvers<void>();
    sandbox.ensureAvailable.mockReturnValueOnce(ensureDeferred.promise);
    const controller = new AbortController();

    const toolRacePromise = raceToolWithStopGrace({
      execute: () =>
        sandboxEditFileTool.execute({
          sandboxInstance: sandbox,
          params: {
            entries: [{ path: '/workspace/a.txt', oldContent: 'old', newContent: 'new' }]
          },
          signal: controller.signal
        }),
      stopSignal: controller.signal,
      graceMs: 20
    });

    await vi.waitFor(() => expect(sandbox.ensureAvailable).toHaveBeenCalledTimes(1));
    controller.abort();
    await expect(toolRacePromise).resolves.toEqual({ status: 'stopped' });

    ensureDeferred.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(sandbox.provider.replaceContent).not.toHaveBeenCalled();

    await expect(
      sandboxEditFileTool.execute({
        sandboxInstance: sandbox,
        params: {
          entries: [{ path: '/workspace/a.txt', oldContent: 'old', newContent: 'new' }]
        },
        signal: controller.signal
      })
    ).rejects.toThrow(STOPPED_TOOL_RESPONSE_TEXT);
  });
});
