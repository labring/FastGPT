import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { runAuxiliaryGeneration } from '@fastgpt/service/core/ai/auxiliaryGeneration/service';

const createStreamMock = vi.hoisted(() =>
  vi.fn(async () => ({
    write: vi.fn(),
    writeError: vi.fn(),
    writeDone: vi.fn(),
    flushResume: vi.fn()
  }))
);
const createUsageMock = vi.hoisted(() =>
  vi.fn(async () => ({
    pushUsage: vi.fn()
  }))
);
const shouldStopMock = vi.hoisted(() => vi.fn(async () => false));
const clearStopMock = vi.hoisted(() => vi.fn(async () => undefined));
const getLeaseMock = vi.hoisted(() => vi.fn());

vi.mock('@fastgpt/service/core/ai/auxiliaryGeneration/stream', () => ({
  createAuxiliaryGenerationStream: createStreamMock
}));

vi.mock('@fastgpt/service/core/ai/auxiliaryGeneration/usage', () => ({
  createAuxiliaryGenerationUsage: createUsageMock
}));

vi.mock('@fastgpt/service/core/ai/auxiliaryGeneration/stop', () => ({
  shouldAuxiliaryGenerationStop: shouldStopMock,
  clearAuxiliaryGenerationStop: clearStopMock
}));

vi.mock('@fastgpt/service/core/chat/generationLease', () => ({
  getActiveChatGenerationLease: getLeaseMock
}));

describe('runAuxiliaryGeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getLeaseMock.mockReturnValue({
      generationRunId: 'run-1',
      signal: new AbortController().signal
    });
  });

  it('does not treat a client disconnect as an explicit stop while auto resume is enabled', async () => {
    const res = new EventEmitter() as any;
    const req = {
      headers: {
        origin: 'https://example.com'
      }
    } as any;
    const processor = vi.fn(async ({ checkIsStopping }) => {
      expect(checkIsStopping()).toBe(false);
      res.emit('close');
      expect(checkIsStopping()).toBe(false);
      return {
        aiResponse: [],
        usage: {
          modelId: 'model-1',
          inputTokens: 0,
          outputTokens: 0
        }
      };
    });

    const result = await runAuxiliaryGeneration({
      req,
      res,
      teamId: 'team-1',
      tmbId: 'member-1',
      userId: 'user-1',
      isRoot: false,
      lang: 'zh-CN',
      appName: 'Test',
      sourceType: ChatSourceTypeEnum.chatAgentHelper,
      sourceId: 'app-1',
      chatId: 'chat-1',
      generationRunId: 'run-1',
      query: 'hello',
      files: [],
      data: {},
      histories: [],
      usageSource: UsageSourceEnum.fastgpt,
      processor
    });

    expect(processor).toHaveBeenCalledTimes(1);
    expect(result.aiResponse).toEqual([]);
    expect(createStreamMock).toHaveBeenCalledWith(
      expect.objectContaining({ generationRunId: 'run-1' })
    );
    expect(clearStopMock).toHaveBeenNthCalledWith(1, {
      sourceType: ChatSourceTypeEnum.chatAgentHelper,
      sourceId: 'app-1',
      chatId: 'chat-1'
    });
    expect(clearStopMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ generationRunId: 'run-1' })
    );
  });

  it('treats a missing or replaced generation lease as stopped', async () => {
    getLeaseMock.mockReturnValue(undefined);
    const res = new EventEmitter() as any;
    const req = { headers: {} } as any;
    const processor = vi.fn(async ({ checkIsStopping }) => {
      expect(checkIsStopping()).toBe(true);
      return {
        aiResponse: [],
        usage: {
          modelId: 'model-1',
          inputTokens: 0,
          outputTokens: 0
        }
      };
    });

    await runAuxiliaryGeneration({
      req,
      res,
      teamId: 'team-1',
      tmbId: 'member-1',
      userId: 'user-1',
      isRoot: false,
      lang: 'zh-CN',
      appName: 'Test',
      sourceType: ChatSourceTypeEnum.chatAgentHelper,
      sourceId: 'app-1',
      chatId: 'chat-1',
      generationRunId: 'run-1',
      query: 'hello',
      files: [],
      data: {},
      histories: [],
      usageSource: UsageSourceEnum.fastgpt,
      processor
    });

    expect(processor).toHaveBeenCalledTimes(1);
  });

  it('still stops when the explicit stop signal is present', async () => {
    shouldStopMock.mockResolvedValueOnce(true);
    const res = new EventEmitter() as any;
    const req = { headers: {} } as any;
    const processor = vi.fn(async ({ checkIsStopping }) => {
      await new Promise((resolve) => setTimeout(resolve, 120));
      expect(checkIsStopping()).toBe(true);
      return {
        aiResponse: [],
        usage: {
          modelId: 'model-1',
          inputTokens: 0,
          outputTokens: 0
        }
      };
    });

    await runAuxiliaryGeneration({
      req,
      res,
      teamId: 'team-1',
      tmbId: 'member-1',
      userId: 'user-1',
      isRoot: false,
      lang: 'zh-CN',
      appName: 'Test',
      sourceType: ChatSourceTypeEnum.chatAgentHelper,
      sourceId: 'app-1',
      chatId: 'chat-1',
      generationRunId: 'run-1',
      query: 'hello',
      files: [],
      data: {},
      histories: [],
      usageSource: UsageSourceEnum.fastgpt,
      processor
    });

    expect(processor).toHaveBeenCalledTimes(1);
  });
});
