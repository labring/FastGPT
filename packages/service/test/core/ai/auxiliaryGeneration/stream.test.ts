import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { workflowSseEvent } from '@fastgpt/global/core/workflow/runtime/sse';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sseWrite: vi.fn(),
  flushResume: vi.fn(),
  getStreamResumeMirror: vi.fn()
}));

vi.mock('@fastgpt/service/common/response/sse', () => ({
  createSseStreamContext: vi.fn(() => ({
    write: mocks.sseWrite,
    flushResume: mocks.flushResume
  }))
}));

vi.mock('@fastgpt/service/core/chat/resume', () => ({
  getStreamResumeMirror: mocks.getStreamResumeMirror
}));

import { createAuxiliaryGenerationStream } from '@fastgpt/service/core/ai/auxiliaryGeneration/stream';

describe('createAuxiliaryGenerationStream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getStreamResumeMirror.mockResolvedValue(undefined);
  });

  const createStream = () =>
    createAuxiliaryGenerationStream({
      req: { headers: {} } as any,
      res: {} as any,
      teamId: 'team-id',
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: 'skill-id',
      chatId: 'chat-id'
    });

  it('serializes an event id as responseValueId for ChatBox updates', async () => {
    const streamContext = await createStream();

    streamContext.write(
      workflowSseEvent.toolParams({
        id: 'call-1',
        params: '{"path":'
      })
    );

    expect(mocks.sseWrite).toHaveBeenCalledWith({
      event: SseResponseEventEnum.toolParams,
      data: JSON.stringify({
        tool: {
          id: 'call-1',
          params: '{"path":'
        },
        responseValueId: 'call-1'
      })
    });
  });

  it('writes the DONE marker without JSON encoding', async () => {
    const streamContext = await createStream();

    streamContext.writeDone();

    expect(mocks.sseWrite).toHaveBeenLastCalledWith({
      event: SseResponseEventEnum.answer,
      data: '[DONE]'
    });
  });
});
