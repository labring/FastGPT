import { describe, expect, it, vi } from 'vitest';

import {
  activateStreamResumeController,
  buildStreamResumeUrl,
  createResumeReadyNotifier,
  createStreamFetchError,
  getStreamTypingQueueConsumeCount,
  handleEventSourceData,
  shouldSendStreamResumeHeader
} from '@/web/common/api/fetch';
import {
  SseResponseEventEnum,
  StreamResumePhaseEnum
} from '@fastgpt/global/core/workflow/runtime/constants';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

describe('handleEventSourceData', () => {
  it('should enqueue answer text for the typing effect', () => {
    const enqueue = vi.fn();
    const onmessage = vi.fn();

    handleEventSourceData({
      event: SseResponseEventEnum.answer,
      data: JSON.stringify({ choices: [{ delta: { content: 'ab' } }] }),
      enqueue,
      onmessage,
      onerror: vi.fn()
    });

    expect(enqueue).toHaveBeenCalledTimes(3);
    expect(enqueue).toHaveBeenNthCalledWith(2, {
      event: SseResponseEventEnum.answer,
      responseValueId: undefined,
      text: 'a'
    });
    expect(enqueue).toHaveBeenNthCalledWith(3, {
      event: SseResponseEventEnum.answer,
      responseValueId: undefined,
      text: 'b'
    });
    expect(onmessage).not.toHaveBeenCalled();
  });

  it('should dispatch tool params immediately without entering the typing queue', () => {
    const enqueue = vi.fn();
    const onmessage = vi.fn();

    handleEventSourceData({
      event: SseResponseEventEnum.toolParams,
      data: JSON.stringify({ responseValueId: 'value-1', id: 'tool-1', params: '{"q":1}' }),
      enqueue,
      onmessage,
      onerror: vi.fn()
    });

    expect(enqueue).not.toHaveBeenCalled();
    expect(onmessage).toHaveBeenCalledWith({
      event: SseResponseEventEnum.toolParams,
      responseValueId: 'value-1',
      id: 'tool-1',
      params: '{"q":1}'
    });
  });

  it('should preserve a structured SSE business error', () => {
    const onerror = vi.fn();
    const error = {
      code: 504001,
      statusText: 'chatIsGenerating',
      message: 'Chat is generating'
    };

    handleEventSourceData({
      event: SseResponseEventEnum.error,
      data: JSON.stringify(error),
      enqueue: vi.fn(),
      onmessage: vi.fn(),
      onerror
    });

    expect(onerror).toHaveBeenCalledWith(error);
  });
});

describe('getStreamTypingQueueConsumeCount', () => {
  it('should keep the typing pace while the response is streaming', () => {
    expect(getStreamTypingQueueConsumeCount({ queueLength: 100, finished: false })).toBe(1);
  });

  it('should consume the whole remaining queue after the stream closes', () => {
    expect(getStreamTypingQueueConsumeCount({ queueLength: 100, finished: true })).toBe(100);
  });

  it('should not consume an empty queue', () => {
    expect(getStreamTypingQueueConsumeCount({ queueLength: 0, finished: true })).toBe(0);
  });
});

describe('createStreamFetchError', () => {
  it('preserves business error metadata from an HTTP response', () => {
    expect(
      createStreamFetchError({
        error: {
          response: {
            data: {
              message: 'Chat is generating',
              statusText: 'chatIsGenerating',
              code: 504001
            }
          }
        },
        fallbackMessage: 'Fallback',
        responseText: ''
      })
    ).toEqual({
      message: 'Chat is generating',
      responseText: '',
      statusText: 'chatIsGenerating',
      code: 504001
    });
  });

  it('omits invalid optional metadata', () => {
    expect(
      createStreamFetchError({
        error: 'Network error',
        fallbackMessage: 'Fallback',
        responseText: 'partial'
      })
    ).toEqual({
      message: 'Network error',
      responseText: 'partial'
    });
  });

  it('falls back safely when the error only contains a numeric code', () => {
    expect(
      createStreamFetchError({
        error: { code: 500 },
        fallbackMessage: 'Fallback',
        responseText: ''
      })
    ).toEqual({
      message: 'Fallback',
      responseText: '',
      code: 500
    });
  });
});

describe('createResumeReadyNotifier', () => {
  it('notifies only once after the resume stream enters the live phase', () => {
    const onResumeReady = vi.fn();
    const notifyResumeReady = createResumeReadyNotifier(onResumeReady);

    notifyResumeReady(StreamResumePhaseEnum.catchup);
    expect(onResumeReady).not.toHaveBeenCalled();

    notifyResumeReady(StreamResumePhaseEnum.live);
    notifyResumeReady(StreamResumePhaseEnum.live);
    expect(onResumeReady).toHaveBeenCalledTimes(1);
  });
});

describe('shouldSendStreamResumeHeader', () => {
  it('enables resume for the Max Skill Helper endpoint', () => {
    expect(shouldSendStreamResumeHeader('/api/maxApi/core/ai/skill/debugChat')).toBe(true);
  });

  it('does not keep the removed Pro Skill Helper endpoint', () => {
    expect(shouldSendStreamResumeHeader('/api/proApi/core/ai/skill/debugChat')).toBe(false);
  });

  it('enables resume for the Max Workflow Builder endpoint', () => {
    expect(shouldSendStreamResumeHeader('/api/maxApi/core/workflow/builder/chat')).toBe(true);
  });

  it('does not keep the removed Pro Workflow Builder endpoint', () => {
    expect(shouldSendStreamResumeHeader('/api/proApi/core/workflow/builder/chat')).toBe(false);
  });
});

describe('buildStreamResumeUrl', () => {
  it('should preserve the workflow builder source type', () => {
    expect(
      buildStreamResumeUrl({
        chatId: 'chat-1',
        chatTarget: {
          appId: 'app-1',
          sourceType: ChatSourceTypeEnum.workflowBuilder
        }
      })
    ).toBe(
      `/api/core/chat/resume?chatId=chat-1&appId=app-1&sourceType=${ChatSourceTypeEnum.workflowBuilder}`
    );
  });

  it('should keep the default app target backward compatible', () => {
    expect(
      buildStreamResumeUrl({
        chatId: 'chat-1',
        chatTarget: { appId: 'app-1' }
      })
    ).toBe('/api/core/chat/resume?chatId=chat-1&appId=app-1');
  });
});

describe('activateStreamResumeController', () => {
  it('should keep different chat resume requests independent', () => {
    const appController = new AbortController();
    const builderController = new AbortController();
    const deactivateApp = activateStreamResumeController('app:chat-1', appController);
    const deactivateBuilder = activateStreamResumeController(
      'workflowBuilder:chat-2',
      builderController
    );

    expect(appController.signal.aborted).toBe(false);
    expect(builderController.signal.aborted).toBe(false);

    deactivateApp();
    deactivateBuilder();
  });

  it('should replace only the previous resume request for the same chat', () => {
    const previousController = new AbortController();
    const activeController = new AbortController();
    const nextController = new AbortController();
    const deactivatePrevious = activateStreamResumeController('app:chat-1', previousController);
    const deactivateActive = activateStreamResumeController('app:chat-1', activeController);

    expect(previousController.signal.aborted).toBe(true);
    expect(previousController.signal.reason).toBe('replace');
    expect(activeController.signal.aborted).toBe(false);

    deactivatePrevious();
    const deactivateNext = activateStreamResumeController('app:chat-1', nextController);
    expect(activeController.signal.aborted).toBe(true);
    expect(nextController.signal.aborted).toBe(false);

    deactivateActive();
    deactivateNext();
  });
});
