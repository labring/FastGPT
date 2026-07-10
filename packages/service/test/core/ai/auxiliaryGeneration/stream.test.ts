import { SseResponseEventEnum } from '@fastgpt/global/core/chat/stream/constants';
import { streamSseEvent } from '@fastgpt/global/core/chat/stream/sse';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const streamMocks = vi.hoisted(() => ({
  sseWrite: vi.fn(),
  flushResume: vi.fn(),
  getStreamResumeMirror: vi.fn()
}));

vi.mock('@fastgpt/service/common/response/sse', () => ({
  createSseStreamContext: vi.fn(() => ({
    write: streamMocks.sseWrite,
    flushResume: streamMocks.flushResume
  }))
}));

vi.mock('@fastgpt/service/core/chat/resume', () => ({
  getStreamResumeMirror: streamMocks.getStreamResumeMirror
}));

import { createAuxiliaryGenerationStream } from '@fastgpt/service/core/ai/auxiliaryGeneration/stream';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

describe('createAuxiliaryGenerationStream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    streamMocks.getStreamResumeMirror.mockResolvedValue(undefined);
  });

  it('serializes typed event id as responseValueId for ChatBox stream updates', async () => {
    const streamContext = await createAuxiliaryGenerationStream({
      req: {
        headers: {}
      } as any,
      res: {} as any,
      teamId: 'team-id',
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: 'skill-id',
      chatId: 'chat-id'
    });

    streamContext.write(
      streamSseEvent.toolParams({
        id: 'call_1',
        params: '{"path":'
      })
    );

    expect(streamMocks.sseWrite).toHaveBeenCalledWith({
      event: SseResponseEventEnum.toolParams,
      data: JSON.stringify({
        tool: {
          id: 'call_1',
          params: '{"path":'
        },
        responseValueId: 'call_1'
      })
    });
  });

  it('keeps raw string payloads unchanged', async () => {
    const streamContext = await createAuxiliaryGenerationStream({
      req: {
        headers: {}
      } as any,
      res: {} as any,
      teamId: 'team-id',
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: 'skill-id',
      chatId: 'chat-id'
    });

    streamContext.write({
      id: 'ignored-for-raw',
      event: SseResponseEventEnum.answer,
      data: '[DONE]'
    });

    expect(streamMocks.sseWrite).toHaveBeenCalledWith({
      event: SseResponseEventEnum.answer,
      data: '[DONE]'
    });
  });
});
