import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { getRedisRuntime } from '@fastgpt/dal/redis/runtime';
import { responseWrite } from '@fastgpt/service/common/response';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import {
  STREAM_RESUME_POST_COMPLETE_TTL_SECONDS,
  getStreamResumeRedisKeys,
  resetStreamResumeMirrorGuardForTest
} from '@fastgpt/service/core/chat/resume';
import { FASTGPT_REDIS_PREFIX } from '@fastgpt/dal/redis/runtime';
import {
  createWorkflowStreamResponseContext,
  isWorkflowSseResponseInitialized,
  initWorkflowSseResponse
} from '@fastgpt/service/core/workflow/dispatch/context/streamResponse';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { workflowSseEvent } from '@fastgpt/global/core/workflow/runtime/sse';
import {
  ChatSourceTypeEnum,
  STREAM_RESUME_REQUEST_HEADER
} from '@fastgpt/global/core/chat/constants';
import type { NodeHttpResponse } from '@fastgpt/service/types/http';

const clearCookieMock = vi.hoisted(() => vi.fn());
const responseWriteMock = vi.hoisted(() => vi.fn());

vi.mock('@fastgpt/service/common/response', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/common/response')>();

  return {
    ...actual,
    responseWrite: responseWriteMock
  };
});

vi.mock('@fastgpt/service/support/permission/auth/common', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@fastgpt/service/support/permission/auth/common')>();

  return {
    ...actual,
    clearCookie: clearCookieMock
  };
});

const teamId = '507f1f77bcf86cd799439111';
const sourceId = '507f1f77bcf86cd799439112';
const chatId = 'stream-context-chat';

const createReq = (headers: Record<string, string | undefined> = {}) =>
  ({
    headers
  }) as any;

/** 使用原生事件语义，并在用例结束时关闭响应，避免真实心跳跨用例残留。 */
const createRes = () => {
  const res = Object.assign(new EventEmitter(), {
    closed: false,
    writableEnded: false,
    destroyed: false,
    headersSent: false,
    setHeader: vi.fn(),
    end: vi.fn()
  });

  onTestFinished(() => {
    res.emit('close');
  });

  return res as typeof res & NodeHttpResponse;
};

describe('initWorkflowSseResponse', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(['finish', 'close', 'error'] as const)(
    'cleans up the heartbeat and initialization marker on %s after idempotent initialization',
    async (event) => {
      vi.useFakeTimers();
      const res = createRes();
      const responseWrite = vi.fn();
      const onError = vi.fn(() => {
        expect(isWorkflowSseResponseInitialized(res)).toBe(false);
        expect(vi.getTimerCount()).toBe(0);
      });

      expect(isWorkflowSseResponseInitialized(res)).toBe(false);
      initWorkflowSseResponse({ res, stream: true, responseWrite, onError });
      expect(isWorkflowSseResponseInitialized(res)).toBe(true);
      initWorkflowSseResponse({ res, stream: true, responseWrite, onError });

      expect(res.setHeader).toHaveBeenCalledTimes(5);
      expect(res.listenerCount('finish')).toBe(1);
      expect(res.listenerCount('close')).toBe(1);
      expect(res.listenerCount('error')).toBe(1);
      expect(vi.getTimerCount()).toBe(1);
      await vi.advanceTimersByTimeAsync(10000);
      expect(responseWrite).toHaveBeenCalledExactlyOnceWith(workflowSseEvent.answerDelta(''));

      res.emit(event, event === 'error' ? new Error('connection failed') : undefined);
      expect(isWorkflowSseResponseInitialized(res)).toBe(false);
      expect(vi.getTimerCount()).toBe(0);

      // error 后还可能收到 close；正常结束也可能同时发出 finish 和 close。
      res.emit('finish');
      res.emit('close');
      await vi.advanceTimersByTimeAsync(20000);

      expect(isWorkflowSseResponseInitialized(res)).toBe(false);
      expect(responseWrite).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledTimes(event === 'error' ? 1 : 0);
      expect(res.end).toHaveBeenCalledTimes(event === 'error' ? 1 : 0);
    }
  );

  it.each([
    { name: 'non-stream requests', stream: false, hasResponse: true },
    { name: 'requests without a response', stream: true, hasResponse: false }
  ])('does not initialize SSE for $name', async ({ stream, hasResponse }) => {
    vi.useFakeTimers();
    const res = createRes();
    const responseWrite = vi.fn();
    const response = hasResponse ? res : undefined;

    initWorkflowSseResponse({ res: response, stream, responseWrite });
    await vi.advanceTimersByTimeAsync(10000);

    expect(isWorkflowSseResponseInitialized(response)).toBe(false);
    expect(res.setHeader).not.toHaveBeenCalled();
    expect(res.eventNames()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
    expect(responseWrite).not.toHaveBeenCalled();
  });

  it('supports heartbeat cleanup when no writer is provided', async () => {
    vi.useFakeTimers();
    const res = createRes();

    initWorkflowSseResponse({ res, stream: true });
    await vi.advanceTimersByTimeAsync(10000);
    expect(isWorkflowSseResponseInitialized(res)).toBe(true);
    expect(vi.getTimerCount()).toBe(1);

    res.emit('close');

    expect(isWorkflowSseResponseInitialized(res)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('createWorkflowStreamResponseContext', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    resetStreamResumeMirrorGuardForTest();

    const redis = getRedisRuntime().getCommandConnection() as any;
    await redis.flushdb();
    redis.call = vi.fn(async () => '1-0');
    redis.info = vi.fn().mockResolvedValue('used_memory:10\r\nmaxmemory:100\r\n');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should only create resume mirror when stream request opts in', async () => {
    const redis = getRedisRuntime().getCommandConnection() as any;
    const sourceType = ChatSourceTypeEnum.app;
    const keys = getStreamResumeRedisKeys({ teamId, sourceType, sourceId, chatId });
    const rawStreamKey = `${FASTGPT_REDIS_PREFIX}${keys.keyOfStream}`;

    const noMirrorContext = await createWorkflowStreamResponseContext({
      req: createReq(),
      res: createRes(),
      stream: true,
      detail: true,
      teamId,
      sourceType,
      sourceId,
      chatId,
      responseId: chatId
    });

    noMirrorContext.responseWrite(workflowSseEvent.done(SseResponseEventEnum.answer));
    await noMirrorContext.flushResume();

    expect(redis.info).not.toHaveBeenCalled();
    expect(redis.call).not.toHaveBeenCalled();

    const mirrorContext = await createWorkflowStreamResponseContext({
      req: createReq({ [STREAM_RESUME_REQUEST_HEADER]: 'true' }),
      res: createRes(),
      stream: true,
      detail: true,
      teamId,
      sourceType,
      sourceId,
      chatId,
      responseId: chatId
    });

    mirrorContext.responseWrite(workflowSseEvent.done(SseResponseEventEnum.answer));
    await mirrorContext.flushResume();

    expect(redis.info).toHaveBeenCalledTimes(1);
    expect(redis.call).toHaveBeenCalledWith(
      'XADD',
      rawStreamKey,
      '*',
      'raw',
      `event: ${SseResponseEventEnum.answer}\ndata: [DONE]\n\n`
    );
    expect(redis.expire).toHaveBeenCalledWith(
      `${FASTGPT_REDIS_PREFIX}${keys.keyOfStream}`,
      STREAM_RESUME_POST_COMPLETE_TTL_SECONDS
    );
  });

  it('should not create resume mirror when resume is disabled even if request opts in', async () => {
    const redis = getRedisRuntime().getCommandConnection() as any;

    const context = await createWorkflowStreamResponseContext({
      req: createReq({ [STREAM_RESUME_REQUEST_HEADER]: 'true' }),
      res: createRes(),
      stream: true,
      detail: true,
      teamId,
      sourceType: ChatSourceTypeEnum.app,
      sourceId,
      chatId,
      responseId: chatId,
      enableStreamResume: false
    });

    context.responseWrite(workflowSseEvent.done(SseResponseEventEnum.answer));

    // flushResume is now always present (no-op when resume disabled)
    expect(context).toHaveProperty('flushResume');
    expect(typeof context.flushResume).toBe('function');
    await context.flushResume();
    // no-op should not interact with Redis when resume is disabled
    expect(redis.info).not.toHaveBeenCalled();
    expect(redis.call).not.toHaveBeenCalled();
  });

  it('should write stream errors and clear expired auth cookies', async () => {
    const context = await createWorkflowStreamResponseContext({
      req: createReq(),
      res: createRes(),
      stream: true,
      detail: true,
      teamId,
      sourceType: ChatSourceTypeEnum.app,
      sourceId,
      chatId
    });

    context.writeStreamError(ERROR_ENUM.unAuthorization);

    expect(clearCookieMock).toHaveBeenCalledTimes(1);
    expect(responseWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        event: SseResponseEventEnum.error,
        data: expect.stringContaining(ERROR_ENUM.unAuthorization)
      })
    );
  });

  it('should skip writing stream errors for non-stream requests', async () => {
    const context = await createWorkflowStreamResponseContext({
      req: createReq({ [STREAM_RESUME_REQUEST_HEADER]: 'true' }),
      res: createRes(),
      stream: false,
      detail: true,
      teamId,
      sourceType: ChatSourceTypeEnum.app,
      sourceId,
      chatId
    });

    context.writeStreamError(new Error('json response path'));

    expect(responseWrite).not.toHaveBeenCalled();
    expect(clearCookieMock).not.toHaveBeenCalled();
  });
});
