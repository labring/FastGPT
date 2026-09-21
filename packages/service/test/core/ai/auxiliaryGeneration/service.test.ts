import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
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
    write: mocks.write,
    writeDone: mocks.writeDone,
    writeError: mocks.writeError,
    flushResume: mocks.flushResume
  }))
}));

vi.mock('@fastgpt/service/core/ai/auxiliaryGeneration/usage', () => ({
  createAuxiliaryGenerationUsage: mocks.createUsage
}));

vi.mock('@fastgpt/service/core/ai/auxiliaryGeneration/stop', () => ({
  clearAuxiliaryGenerationStop: mocks.clearStop,
  shouldAuxiliaryGenerationStop: mocks.shouldStop
}));

import { runAuxiliaryGeneration } from '@fastgpt/service/core/ai/auxiliaryGeneration/service';

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
      req: { headers: {} } as any,
      res: { once: resOnce } as any,
      teamId: 'team-id',
      tmbId: 'tmb-id',
      userId: 'user-id',
      isRoot: false,
      lang: 'zh',
      appName: 'Test',
      sourceType: ChatSourceTypeEnum.skillEdit,
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
    mocks.shouldStop.mockResolvedValue(false);
    mocks.clearStop.mockResolvedValue(undefined);
    mocks.createUsage.mockImplementation(async ({ usageId }) => ({
      pushUsage: mocks.pushUsage,
      usageId: usageId ?? 'new-usage-id'
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('passes the reused usage id and persists before closing the stream', async () => {
    const processor = vi.fn(async () => ({
      aiResponse: [{ text: { content: 'answer' } }]
    }));
    const onBeforeStreamDone = vi.fn();

    await runGeneration({ processor, onBeforeStreamDone });

    expect(mocks.createUsage).toHaveBeenCalledWith(
      expect.objectContaining({ usageId: 'existing-usage-id' })
    );
    expect(processor).toHaveBeenCalledWith(
      expect.objectContaining({
        usageId: 'existing-usage-id',
        usageSink: mocks.pushUsage
      })
    );
    expect(onBeforeStreamDone).toHaveBeenCalledWith(
      expect.objectContaining({
        result: expect.objectContaining({
          aiResponse: [{ text: { content: 'answer' } }]
        }),
        durationSeconds: expect.any(Number)
      })
    );
    expect(onBeforeStreamDone.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.writeDone.mock.invocationCallOrder[0]
    );
  });

  it('does not let a late stop poll overwrite a close event', async () => {
    vi.useFakeTimers();
    let closeHandler = () => undefined;
    let resolvePoll = (_value: boolean) => undefined;
    let markPollStarted = () => undefined;
    const pollStarted = new Promise<void>((resolve) => {
      markPollStarted = resolve;
    });
    mocks.shouldStop.mockImplementationOnce(
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
    mocks.createUsage.mockRejectedValueOnce(new Error('usage failed'));

    await expect(runGeneration({ processor: vi.fn() })).rejects.toThrow('usage failed');
    expect(mocks.clearStop).toHaveBeenCalledTimes(1);
  });
});
