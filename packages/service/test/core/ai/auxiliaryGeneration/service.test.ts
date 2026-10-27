import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';

const mocks = vi.hoisted(() => ({
  createStream: vi.fn(),
  createUsage: vi.fn(),
  clearStop: vi.fn(),
  shouldStop: vi.fn()
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

import { runAuxiliaryGeneration } from '@fastgpt/service/core/ai/auxiliaryGeneration/service';

describe('runAuxiliaryGeneration connection lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createStream.mockResolvedValue({
      write: vi.fn(),
      writeError: vi.fn(),
      writeDone: vi.fn(),
      flushResume: vi.fn(),
      cleanup: vi.fn()
    });
    mocks.createUsage.mockResolvedValue({ pushUsage: vi.fn() });
    mocks.clearStop.mockResolvedValue(undefined);
    mocks.shouldStop.mockImplementation(async () => false);
  });

  it('continues after response close and stops only after the explicit stop signal', async () => {
    const response = new EventEmitter();
    let stopRequested = false;
    mocks.shouldStop.mockImplementation(async () => stopRequested);
    const processorStarted = Promise.withResolvers<() => boolean>();
    const finishProcessor = Promise.withResolvers<void>();
    const run = runAuxiliaryGeneration({
      req: { headers: {} } as any,
      res: response as any,
      teamId: 'team-1',
      tmbId: 'member-1',
      userId: 'user-1',
      isRoot: false,
      lang: 'zh-CN',
      appName: 'ChatAgentHelper',
      sourceType: ChatSourceTypeEnum.chatAgentHelper,
      sourceId: 'helper-1',
      chatId: 'chat-1',
      query: '继续优化',
      files: [],
      data: {},
      histories: [],
      usageSource: UsageSourceEnum.fastgpt,
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
  });
});
