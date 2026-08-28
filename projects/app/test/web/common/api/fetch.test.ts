import { describe, expect, it, vi } from 'vitest';

import {
  activateStreamResumeController,
  buildStreamResumeUrl,
  getStreamTypingQueueConsumeCount,
  handleEventSourceData
} from '@/web/common/api/fetch';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
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
