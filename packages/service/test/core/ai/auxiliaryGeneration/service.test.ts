import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';

const mocks = vi.hoisted(() => ({
  createStream: vi.fn(),
  createUsage: vi.fn(),
  clearStop: vi.fn(),
  shouldStop: vi.fn(),
  getActiveLease: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/auxiliaryGeneration/stream', () => ({
  createAuxiliaryGenerationStream: mocks.createStream
}));
vi.mock('@fastgpt/service/core/ai/auxiliaryGeneration/usage', () => ({
  createAuxiliaryGenerationUsage: mocks.createUsage
}));
vi.mock('@fastgpt/service/core/ai/auxiliaryGeneration/stop', () => ({
  clearAuxiliaryGenerationStop: mocks.clearStop,
  shouldAuxiliaryGenerationStop: mocks.shouldStop
}));
vi.mock('@fastgpt/service/core/chat/generationLease', () => ({
  getActiveChatGenerationLease: mocks.getActiveLease
}));

import { runAuxiliaryGeneration } from '@fastgpt/service/core/ai/auxiliaryGeneration/service';

const createRunParams = (overrides: Record<string, unknown> = {}) => ({
  req: { headers: {} } as any,
  res: new EventEmitter() as any,
  teamId: 'team-1',
  tmbId: 'member-1',
  userId: 'user-1',
  isRoot: false,
  lang: 'zh-CN' as const,
  appName: 'ChatAgentHelper',
  sourceType: ChatSourceTypeEnum.chatAgentHelper,
  sourceId: 'helper-1',
  chatId: 'chat-1',
  generationRunnerId: 'runner-1',
  query: '继续优化',
  files: [],
  data: {},
  histories: [],
  usageSource: UsageSourceEnum.fastgpt,
  ...overrides
});

describe('runAuxiliaryGeneration connection lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createStream.mockResolvedValue({
      write: vi.fn(),
      writeError: vi.fn(),
      writeDone: vi.fn(),
      flushResume: vi.fn(async () => undefined),
      cleanup: vi.fn()
    });
    mocks.createUsage.mockResolvedValue({ pushUsage: vi.fn() });
    mocks.clearStop.mockResolvedValue(undefined);
    mocks.shouldStop.mockImplementation(async () => false);
    mocks.getActiveLease.mockReturnValue({
      generationRunnerId: 'runner-1',
      signal: new AbortController().signal
    });
  });

  it('continues after response close and stops only after the explicit stop signal', async () => {
    const response = new EventEmitter();
    let stopRequested = false;
    mocks.shouldStop.mockImplementation(async () => stopRequested);
    const processorStarted = Promise.withResolvers<() => boolean>();
    const finishProcessor = Promise.withResolvers<void>();
    const run = runAuxiliaryGeneration({
      ...createRunParams({ res: response }),
      processor: async ({ checkIsStopping }) => {
        processorStarted.resolve(checkIsStopping!);
        await finishProcessor.promise;
        return {
          aiResponse: [],
          usage: { modelId: 'model-1', inputTokens: 0, outputTokens: 0 }
        };
      }
    });
    const checkIsStopping = await processorStarted.promise;

    response.emit('close');
    expect(checkIsStopping()).toBe(false);

    stopRequested = true;
    await vi.waitFor(() => expect(checkIsStopping()).toBe(true));
    finishProcessor.resolve();
    await expect(run).resolves.toMatchObject({ aiResponse: [] });
    expect(mocks.clearStop).toHaveBeenCalledTimes(2);
    expect(mocks.clearStop).toHaveBeenLastCalledWith(
      expect.objectContaining({ generationRunnerId: 'runner-1' })
    );
  });

  it('aborts generation when the Redis runner lease is lost', async () => {
    mocks.getActiveLease.mockReturnValue(undefined);

    await runAuxiliaryGeneration({
      ...createRunParams(),
      processor: async ({ checkIsStopping }) => {
        expect(checkIsStopping()).toBe(true);
        return {
          aiResponse: [],
          usage: { modelId: 'model-1', inputTokens: 0, outputTokens: 0 }
        };
      }
    });

    expect(mocks.createStream).toHaveBeenCalledWith(
      expect.objectContaining({ generationRunnerId: 'runner-1' })
    );
  });

  it('flushes and cleans the stream context when setup fails', async () => {
    const error = new Error('usage failed');
    const streamContext = await mocks.createStream();
    mocks.createStream.mockResolvedValueOnce(streamContext);
    mocks.createUsage.mockRejectedValueOnce(error);

    await expect(
      runAuxiliaryGeneration({
        ...createRunParams(),
        processor: vi.fn()
      })
    ).rejects.toThrow(error);

    expect(streamContext.flushResume).toHaveBeenCalledOnce();
    expect(streamContext.cleanup).toHaveBeenCalledOnce();
  });
});
