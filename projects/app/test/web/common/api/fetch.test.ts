import { describe, expect, it, vi } from 'vitest';

import {
  activateStreamResumeController,
  buildStreamResumeUrl,
  createResumeReadyNotifier,
  createStreamFetchError,
  getStreamReasoningQueueConsumeCount,
  getStreamTypingQueueConsumeCount,
  handleEventSourceData
} from '@/web/common/api/fetch';
import {
  SseResponseEventEnum,
  StreamResumePhaseEnum
} from '@fastgpt/global/core/workflow/runtime/constants';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

describe('handleEventSourceData', () => {
  it('should enqueue reasoning before answer text for the typing effect', () => {
    const enqueue = vi.fn();
    const onmessage = vi.fn();

    handleEventSourceData({
      event: SseResponseEventEnum.answer,
      data: JSON.stringify({
        choices: [{ delta: { reasoning_content: 'thinking', content: 'ab' } }]
      }),
      enqueue,
      onmessage,
      onerror: vi.fn()
    });

    expect(enqueue).toHaveBeenCalledTimes(3);
    expect(enqueue).toHaveBeenNthCalledWith(1, {
      event: SseResponseEventEnum.answer,
      responseValueId: undefined,
      reasoningText: 'thinking'
    });
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

  it('should skip empty reasoning queue items', () => {
    const enqueue = vi.fn();

    handleEventSourceData({
      event: SseResponseEventEnum.answer,
      data: JSON.stringify({ choices: [{ delta: { content: 'a' } }] }),
      enqueue,
      onmessage: vi.fn(),
      onerror: vi.fn()
    });

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith({
      event: SseResponseEventEnum.answer,
      responseValueId: undefined,
      text: 'a'
    });
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

describe('getStreamReasoningQueueConsumeCount', () => {
  it('should consume the reasoning prefix when answer text arrives', () => {
    expect(
      getStreamReasoningQueueConsumeCount([
        { event: SseResponseEventEnum.answer, reasoningText: 'one' },
        { event: SseResponseEventEnum.answer, reasoningText: 'two' },
        { event: SseResponseEventEnum.answer, text: 'answer' }
      ])
    ).toBe(2);
  });

  it('should preserve answer text already at the queue head', () => {
    expect(
      getStreamReasoningQueueConsumeCount([
        { event: SseResponseEventEnum.answer, text: 'answer' },
        { event: SseResponseEventEnum.answer, reasoningText: 'late reasoning' }
      ])
    ).toBe(0);
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

describe('buildStreamResumeUrl', () => {
  it.each([
    { name: 'App', chatTarget: { appId: 'app-1' }, expected: { appId: 'app-1' } },
    {
      name: 'Agent Helper',
      chatTarget: { appId: 'app-1', sourceType: ChatSourceTypeEnum.chatAgentHelper as const },
      expected: { appId: 'app-1', sourceType: ChatSourceTypeEnum.chatAgentHelper }
    },
    { name: 'Skill', chatTarget: { skillId: 'skill-1' }, expected: { skillId: 'skill-1' } },
    {
      name: 'share link',
      chatTarget: { outLinkAuthData: { shareId: 'share-1', outLinkUid: 'user-1' } },
      expected: { outLinkAuthData: JSON.stringify({ shareId: 'share-1', outLinkUid: 'user-1' }) }
    }
  ])('preserves the $name chat target', ({ chatTarget, expected }) => {
    const url = new URL(
      buildStreamResumeUrl({ chatId: 'chat-1', chatTarget }),
      'https://example.com'
    );

    expect(url.pathname).toBe('/api/core/chat/resume');
    expect(Object.fromEntries(url.searchParams)).toEqual({ chatId: 'chat-1', ...expected });
  });
});

describe('activateStreamResumeController', () => {
  it('keeps different chat resume requests independent', () => {
    const targets = [
      { chatId: 'chat-1', chatTarget: { appId: 'app-1' } },
      { chatId: 'chat-2', chatTarget: { appId: 'app-1' } },
      { chatId: 'chat-1', chatTarget: { appId: 'app-2' } },
      {
        chatId: 'chat-1',
        chatTarget: { appId: 'app-1', sourceType: ChatSourceTypeEnum.chatAgentHelper as const }
      }
    ];
    const controllers = targets.map(() => new AbortController());
    const cleanups = targets.map((target, index) =>
      activateStreamResumeController(buildStreamResumeUrl(target), controllers[index])
    );

    controllers.forEach((controller) => expect(controller.signal.aborted).toBe(false));
    cleanups.forEach((cleanup) => cleanup());
  });

  it('replaces only the same chat and keeps newer requests registered after stale cleanup', () => {
    const key = buildStreamResumeUrl({ chatId: 'chat-1', chatTarget: { appId: 'app-1' } });
    const previousController = new AbortController();
    const activeController = new AbortController();
    const nextController = new AbortController();
    const deactivatePrevious = activateStreamResumeController(key, previousController);
    const deactivateActive = activateStreamResumeController(key, activeController);

    expect(previousController.signal.aborted).toBe(true);
    expect(previousController.signal.reason).toBe('replace');
    activateStreamResumeController(key, activeController);
    expect(activeController.signal.aborted).toBe(false);

    deactivatePrevious();
    const deactivateNext = activateStreamResumeController(key, nextController);
    expect(activeController.signal.aborted).toBe(true);
    expect(nextController.signal.aborted).toBe(false);

    deactivateActive();
    deactivateNext();
  });
});
