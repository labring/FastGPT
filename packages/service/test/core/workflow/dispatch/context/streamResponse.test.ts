import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { getRedisRuntime } from '@fastgpt/dal/redis/runtime';
import { responseWrite } from '@fastgpt/service/common/response';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import * as streamResume from '@fastgpt/service/core/chat/resume';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
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

const {
  getStreamResumeRedisKeys,
  STREAM_RESUME_MIRROR_KEEPALIVE_INTERVAL_MS,
  STREAM_RESUME_TTL_SECONDS
} = streamResume;

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

  it.each([
    { event: 'finish', hasWriter: true },
    { event: 'close', hasWriter: true },
    { event: 'error', hasWriter: true },
    { event: 'close', hasWriter: false }
  ])(
    'cleans up heartbeat and marker on $event after idempotent initialization (writer=$hasWriter)',
    async ({ event, hasWriter }) => {
      vi.useFakeTimers();
      const res = createRes();
      const responseWrite = vi.fn();
      const onError = vi.fn(() => {
        expect(isWorkflowSseResponseInitialized(res)).toBe(false);
        expect(vi.getTimerCount()).toBe(0);
      });

      expect(isWorkflowSseResponseInitialized(res)).toBe(false);
      const options = {
        res,
        stream: true,
        responseWrite: hasWriter ? responseWrite : undefined,
        onError
      };
      initWorkflowSseResponse(options);
      expect(isWorkflowSseResponseInitialized(res)).toBe(true);
      initWorkflowSseResponse(options);

      expect(res.setHeader).toHaveBeenCalledTimes(5);
      expect(res.listenerCount('finish')).toBe(1);
      expect(res.listenerCount('close')).toBe(1);
      expect(res.listenerCount('error')).toBe(1);
      expect(vi.getTimerCount()).toBe(1);
      await vi.advanceTimersByTimeAsync(10000);
      expect(responseWrite.mock.calls).toEqual(
        hasWriter ? [[workflowSseEvent.answerDelta('')]] : []
      );

      res.emit(event, event === 'error' ? new Error('connection failed') : undefined);
      expect(isWorkflowSseResponseInitialized(res)).toBe(false);
      expect(vi.getTimerCount()).toBe(0);

      // error 后还可能收到 close；正常结束也可能同时发出 finish 和 close。
      res.emit('finish');
      res.emit('close');
      await vi.advanceTimersByTimeAsync(20000);

      expect(isWorkflowSseResponseInitialized(res)).toBe(false);
      expect(responseWrite).toHaveBeenCalledTimes(hasWriter ? 1 : 0);
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
});

describe('createWorkflowStreamResponseContext', () => {
  /** 共用 HTTP/身份夹具；每个场景只声明会改变流行为的输入。 */
  const createContext = ({
    req = createReq(),
    res = createRes(),
    ...overrides
  }: Partial<Parameters<typeof createWorkflowStreamResponseContext>[0]> = {}) =>
    createWorkflowStreamResponseContext({
      teamId,
      sourceType: ChatSourceTypeEnum.app,
      sourceId,
      chatId,
      req,
      res,
      stream: true,
      detail: true,
      ...overrides
    });

  beforeEach(async () => {
    vi.clearAllMocks();
    streamResume.resetStreamResumeMirrorGuardForTest();

    const redis = getRedisRuntime().getCommandConnection() as any;
    await redis.flushdb();
    redis.call = vi.fn(async () => '1-0');
    redis.info = vi.fn().mockResolvedValue('used_memory:10\r\nmaxmemory:100\r\n');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('断连后继续镜像并续期，完成时停止续期且只收尾一次', async () => {
    vi.useFakeTimers();
    const res = createRes();
    const params = { teamId, sourceType: ChatSourceTypeEnum.app, sourceId, chatId };
    const redis = getRedisRuntime().getCommandConnection() as any;
    const keys = getStreamResumeRedisKeys(params);
    const context = await createContext({
      ...params,
      req: createReq({ [STREAM_RESUME_REQUEST_HEADER]: 'true' }),
      res
    });

    context.responseWrite(workflowSseEvent.answerDelta('hello'));
    await vi.advanceTimersByTimeAsync(10_000);
    res.closed = true;
    res.emit('close');
    redis.expire.mockClear();
    vi.mocked(responseWrite).mockClear();

    await vi.advanceTimersByTimeAsync(STREAM_RESUME_MIRROR_KEEPALIVE_INTERVAL_MS);
    expect(redis.expire).toHaveBeenCalledWith(
      `${FASTGPT_REDIS_PREFIX}${keys.keyOfStream}`,
      STREAM_RESUME_TTL_SECONDS
    );

    context.responseWrite(workflowSseEvent.done(SseResponseEventEnum.answer));
    const flush = context.flushResume();
    expect(context.flushResume()).toBe(flush);
    await flush;
    expect(redis.call).toHaveBeenCalledWith(
      'XADD',
      `${FASTGPT_REDIS_PREFIX}${keys.keyOfStream}`,
      '*',
      'raw',
      `event: ${SseResponseEventEnum.answer}\ndata: [DONE]\n\n`
    );
    expect(responseWrite).not.toHaveBeenCalled();
    const completionExpirations = redis.expire.mock.calls.filter(
      ([, ttl]: [string, number]) => ttl === streamResume.STREAM_RESUME_POST_COMPLETE_TTL_SECONDS
    );
    expect(completionExpirations).toHaveLength(2);

    await context.flushResume();
    expect(
      redis.expire.mock.calls.filter(
        ([, ttl]: [string, number]) => ttl === streamResume.STREAM_RESUME_POST_COMPLETE_TTL_SECONDS
      )
    ).toHaveLength(2);

    redis.expire.mockClear();
    await vi.advanceTimersByTimeAsync(STREAM_RESUME_MIRROR_KEEPALIVE_INTERVAL_MS);
    expect(redis.expire).not.toHaveBeenCalled();
  });

  it.each([ChatSourceTypeEnum.app, ChatSourceTypeEnum.workflowBuilder])(
    'should only create resume mirror when %s stream request opts in',
    async (sourceType) => {
      const redis = getRedisRuntime().getCommandConnection() as any;
      const keys = getStreamResumeRedisKeys({ teamId, sourceType, sourceId, chatId });
      const rawStreamKey = `${FASTGPT_REDIS_PREFIX}${keys.keyOfStream}`;

      const noMirrorContext = await createContext({ sourceType, responseId: chatId });

      noMirrorContext.responseWrite(workflowSseEvent.done(SseResponseEventEnum.answer));
      await noMirrorContext.flushResume();

      expect(redis.info).not.toHaveBeenCalled();
      expect(redis.call).not.toHaveBeenCalled();

      const mirrorContext = await createContext({
        req: createReq({ [STREAM_RESUME_REQUEST_HEADER]: 'true' }),
        sourceType,
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
        streamResume.STREAM_RESUME_POST_COMPLETE_TTL_SECONDS
      );
    }
  );

  it.each(['flush', 'shrinkTTLAfterComplete'] as const)(
    'should log %s errors without rejecting stream cleanup',
    async (failedStep) => {
      const sourceType = ChatSourceTypeEnum.app;
      const error = new Error('Resume cache cleanup failed');
      const mirror = {
        ...streamResume.getStreamResumeRedisKeys({ teamId, sourceType, sourceId, chatId }),
        enqueueRaw: vi.fn(),
        touch: vi.fn(async () => undefined),
        flush: vi.fn(async () => undefined),
        shrinkTTLAfterComplete: vi.fn(async () => undefined)
      };
      mirror[failedStep].mockRejectedValueOnce(error);
      vi.spyOn(streamResume, 'getStreamResumeMirror').mockResolvedValueOnce(mirror);
      const errorLog = vi
        .spyOn(getLogger(LogCategories.MODULE.CHAT.RESUME), 'error')
        .mockImplementation(() => undefined);
      const res = createRes();
      const context = await createContext({
        req: createReq({ [STREAM_RESUME_REQUEST_HEADER]: 'true' }),
        res,
        sourceType
      });

      await expect(context.flushResume()).resolves.toBeUndefined();

      expect(mirror.flush).toHaveBeenCalledOnce();
      expect(mirror.shrinkTTLAfterComplete).toHaveBeenCalledOnce();
      expect(errorLog).toHaveBeenCalledOnce();
      expect(errorLog).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ chatId, error })
      );
      res.emit('finish');
    }
  );

  it('should stop the resume mirror keepalive when the response finishes', async () => {
    vi.useFakeTimers();
    const redis = getRedisRuntime().getCommandConnection() as any;
    const res = createRes();
    const context = await createContext({
      req: createReq({ [STREAM_RESUME_REQUEST_HEADER]: 'true' }),
      res,
      responseId: chatId
    });

    context.responseWrite(workflowSseEvent.answerDelta('hello'));
    await vi.advanceTimersByTimeAsync(10_000);
    res.emit('finish');
    redis.expire.mockClear();

    await vi.advanceTimersByTimeAsync(STREAM_RESUME_MIRROR_KEEPALIVE_INTERVAL_MS);
    expect(redis.expire).not.toHaveBeenCalled();
  });

  it('should not create resume mirror when resume is disabled even if request opts in', async () => {
    const redis = getRedisRuntime().getCommandConnection() as any;

    const context = await createContext({
      req: createReq({ [STREAM_RESUME_REQUEST_HEADER]: 'true' }),
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

  it.each([
    {
      name: 'expired authentication',
      stream: true,
      error: ERROR_ENUM.unAuthorization,
      clearsCookie: true
    },
    {
      name: 'ordinary stream error',
      stream: true,
      error: new Error('stream failed'),
      clearsCookie: false
    },
    {
      name: 'non-stream error',
      stream: false,
      error: new Error('json response path'),
      clearsCookie: false
    }
  ])('routes $name without clearing unrelated cookies', async ({ stream, error, clearsCookie }) => {
    const context = await createContext({
      req: createReq(stream ? {} : { [STREAM_RESUME_REQUEST_HEADER]: 'true' }),
      stream
    });

    context.writeStreamError(error);

    expect(clearCookieMock).toHaveBeenCalledTimes(clearsCookie ? 1 : 0);
    expect(vi.mocked(responseWrite).mock.calls).toEqual(
      stream
        ? [
            [
              expect.objectContaining({
                event: SseResponseEventEnum.error,
                data: expect.stringContaining(typeof error === 'string' ? error : error.message)
              })
            ]
          ]
        : []
    );
  });
});
