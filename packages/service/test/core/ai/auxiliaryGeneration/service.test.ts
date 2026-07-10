import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { SseResponseEventEnum } from '@fastgpt/global/core/chat/stream/constants';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auxiliaryGenerationMocks = vi.hoisted(() => ({
  write: vi.fn(),
  writeDone: vi.fn(),
  writeError: vi.fn(),
  flushResume: vi.fn(),
  pushUsage: vi.fn(),
  createUsage: vi.fn(),
  clearStop: vi.fn(),
  shouldStop: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/auxiliaryGeneration/stream', () => ({
  createAuxiliaryGenerationStream: vi.fn(async () => ({
    write: auxiliaryGenerationMocks.write,
    writeDone: auxiliaryGenerationMocks.writeDone,
    writeError: auxiliaryGenerationMocks.writeError,
    flushResume: auxiliaryGenerationMocks.flushResume
  }))
}));

vi.mock('@fastgpt/service/core/ai/auxiliaryGeneration/usage', () => ({
  createAuxiliaryGenerationUsage: auxiliaryGenerationMocks.createUsage
}));

vi.mock('@fastgpt/service/core/ai/runtimeStatus', () => ({
  clearAgentRuntimeStop: auxiliaryGenerationMocks.clearStop,
  shouldAgentRuntimeStop: auxiliaryGenerationMocks.shouldStop
}));

import { runAuxiliaryGeneration } from '@fastgpt/service/core/ai/auxiliaryGeneration';

describe('runAuxiliaryGeneration', () => {
  const runGeneration = ({
    processor,
    resOnce = vi.fn(),
    onBeforeStreamDone
  }: {
    processor: (params: any) => Promise<any>;
    resOnce?: ReturnType<typeof vi.fn>;
    onBeforeStreamDone?: (params: any) => Promise<void> | void;
  }) =>
    runAuxiliaryGeneration({
      req: {
        headers: {}
      } as any,
      res: {
        once: resOnce
      } as any,
      teamId: 'team-id',
      tmbId: 'tmb-id',
      userId: 'user-id',
      isRoot: false,
      lang: 'zh',
      appName: 'Test',
      sourceType: ChatSourceTypeEnum.chatAgentHelper,
      sourceId: 'source-id',
      chatId: 'chat-id',
      query: 'hello',
      files: [],
      data: undefined,
      histories: [],
      usageSource: UsageSourceEnum.fastgpt,
      usageId: 'existing-usage-id',
      processor,
      onBeforeStreamDone
    });

  beforeEach(() => {
    vi.clearAllMocks();
    auxiliaryGenerationMocks.shouldStop.mockResolvedValue(false);
    auxiliaryGenerationMocks.clearStop.mockResolvedValue(undefined);
    auxiliaryGenerationMocks.createUsage.mockImplementation(async ({ usageId }) => ({
      pushUsage: auxiliaryGenerationMocks.pushUsage,
      usageId: usageId ?? 'new-usage-id'
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('passes the usage context and persists before closing the stream', async () => {
    const processor = vi.fn(async () => ({
      aiResponse: [{ text: { content: 'answer' } }]
    }));
    const onBeforeStreamDone = vi.fn();

    await runGeneration({
      processor,
      onBeforeStreamDone
    });

    expect(onBeforeStreamDone).toHaveBeenCalledWith(
      expect.objectContaining({
        result: expect.objectContaining({
          aiResponse: [{ text: { content: 'answer' } }]
        }),
        durationSeconds: expect.any(Number)
      })
    );
    expect(processor).toHaveBeenCalledWith(
      expect.objectContaining({
        usageId: 'existing-usage-id'
      })
    );
    expect(auxiliaryGenerationMocks.createUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        usageId: 'existing-usage-id'
      })
    );
    expect(auxiliaryGenerationMocks.write).toHaveBeenCalledWith(
      expect.objectContaining({
        event: SseResponseEventEnum.workflowDuration
      })
    );
    expect(onBeforeStreamDone.mock.invocationCallOrder[0]).toBeLessThan(
      auxiliaryGenerationMocks.writeDone.mock.invocationCallOrder[0]
    );
  });

  it('keeps the stop state true when an in-flight Redis poll resolves after disconnect', async () => {
    vi.useFakeTimers();
    let closeHandler = () => undefined;
    let resolvePoll: (value: boolean) => void = vi.fn();
    let markPollStarted: () => void = vi.fn();
    const pollStarted = new Promise<void>((resolve) => {
      markPollStarted = resolve;
    });
    auxiliaryGenerationMocks.shouldStop.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          resolvePoll = resolve;
          markPollStarted();
        })
    );
    const processor = vi.fn(async ({ checkIsStopping }) => {
      vi.advanceTimersByTime(100);
      await pollStarted;
      closeHandler();
      resolvePoll(false);
      await Promise.resolve();
      await Promise.resolve();

      expect(checkIsStopping()).toBe(true);
      return { aiResponse: [] };
    });

    await runGeneration({
      processor,
      resOnce: vi.fn((event, handler) => {
        if (event === 'close') closeHandler = handler;
      })
    });
  });

  it('clears the stop marker when usage initialization fails', async () => {
    auxiliaryGenerationMocks.createUsage.mockRejectedValueOnce(new Error('usage failed'));

    await expect(
      runGeneration({
        processor: vi.fn()
      })
    ).rejects.toThrow('usage failed');
    expect(auxiliaryGenerationMocks.clearStop).toHaveBeenCalledTimes(1);
  });
});
