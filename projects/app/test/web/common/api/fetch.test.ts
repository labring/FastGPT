import { describe, expect, it, vi } from 'vitest';

import {
  createResumeReadyNotifier,
  createStreamFetchError,
  getStreamTypingQueueConsumeCount,
  handleEventSourceData
} from '@/web/common/api/fetch';
import {
  SseResponseEventEnum,
  StreamResumePhaseEnum
} from '@fastgpt/global/core/workflow/runtime/constants';

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
