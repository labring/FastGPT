import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { responseWrite } from '@fastgpt/service/common/response';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import {
  STREAM_RESUME_POST_COMPLETE_TTL_SECONDS,
  getStreamResumeRedisKeys,
  resetStreamResumeMirrorGuardForTest
} from '@fastgpt/service/core/chat/resume';
import { FASTGPT_REDIS_PREFIX, getGlobalRedisConnection } from '@fastgpt/service/common/redis';
import {
  createWorkflowStreamResponseContext,
  isWorkflowSseResponseInitialized,
  initWorkflowSseResponse
} from '@fastgpt/service/core/workflow/utils/streamResponseContext';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { workflowSseEvent } from '@fastgpt/global/core/workflow/runtime/sse';
import {
  ChatSourceTypeEnum,
  STREAM_RESUME_REQUEST_HEADER
} from '@fastgpt/global/core/chat/constants';

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

const createRes = () => {
  const listeners: Record<string, Array<() => void>> = {};
  const res = {
    closed: false,
    writableEnded: false,
    destroyed: false,
    headersSent: false,
    setHeader: vi.fn(),
    on: vi.fn((event: string, listener: () => void) => {
      listeners[event] ??= [];
      listeners[event].push(listener);
      return res;
    }),
    once: vi.fn((event: string, listener: () => void) => {
      listeners[event] ??= [];
      listeners[event].push(listener);
      return res;
    }),
    end: vi.fn(),
    emit(event: string) {
      listeners[event]?.forEach((listener) => listener());
    }
  };

  return res as any;
};

describe('createWorkflowStreamResponseContext', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    resetStreamResumeMirrorGuardForTest();

    const redis = getGlobalRedisConnection() as any;
    await redis.flushdb();
    redis.call = vi.fn(async () => '1-0');
    redis.info = vi.fn().mockResolvedValue('used_memory:10\r\nmaxmemory:100\r\n');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should bind heartbeat cleanup to response lifecycle and keep init idempotent', async () => {
    vi.useFakeTimers();
    const res = createRes();
    const responseWrite = vi.fn();

    expect(isWorkflowSseResponseInitialized(res)).toBe(false);
    initWorkflowSseResponse({
      res,
      stream: true,
      responseWrite
    });
    expect(isWorkflowSseResponseInitialized(res)).toBe(true);
    initWorkflowSseResponse({
      res,
      stream: true,
      responseWrite
    });

    await vi.advanceTimersByTimeAsync(10000);
    expect(responseWrite).toHaveBeenCalledTimes(1);
    expect(res.setHeader).toHaveBeenCalledTimes(5);

    res.emit('finish');
    expect(isWorkflowSseResponseInitialized(res)).toBe(false);
    await vi.advanceTimersByTimeAsync(10000);
    expect(responseWrite).toHaveBeenCalledTimes(1);
  });

  it('should only create resume mirror when stream request opts in', async () => {
    const redis = getGlobalRedisConnection() as any;
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
      keys.keyOfStream,
      STREAM_RESUME_POST_COMPLETE_TTL_SECONDS
    );
  });

  it('should not create resume mirror when resume is disabled even if request opts in', async () => {
    const redis = getGlobalRedisConnection() as any;

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

    expect(context).not.toHaveProperty('flushResume');
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
