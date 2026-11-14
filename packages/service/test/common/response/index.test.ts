import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiRequestInputParseError } from '../../../common/zod/requestParseError';
import { UserError, UserConfigError } from '@fastgpt/global/common/error/utils';
import { ERROR_ENUM, ERROR_RESPONSE } from '@fastgpt/global/common/error/errorCode';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { SandboxErrEnum } from '@fastgpt/global/common/error/code/sandbox';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { EventEmitter } from 'node:events';
import {
  ChatEntryModerationError,
  ChatGeneratingConflictError,
  isChatEntryModerationError
} from '@fastgpt/global/core/chat/error';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { S3ErrEnum } from '@fastgpt/global/common/error/code/s3';
import {
  MODERATION_BLOCKED_ERROR_MESSAGE,
  MODERATION_ERROR_BLOCKED_MESSAGE
} from '@fastgpt/global/core/plugin/moderation/constants';

vi.unmock('@fastgpt/service/common/response');

const { logger } = vi.hoisted(() => ({
  logger: {
    info: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock('@fastgpt/service/common/logger', () => ({
  getLogger: () => logger,
  LogCategories: {
    HTTP: {
      ERROR: 'http.error'
    }
  }
}));

const profilingMocks = vi.hoisted(() => ({ markProfileError: vi.fn() }));

vi.mock('@fastgpt/service/common/profiling', () => profilingMocks);

const { getSseErrorResponse, jsonRes, processError, responseWrite, sseErrRes } =
  await import('../../../common/response');

describe('chat generating conflict recovery target', () => {
  it.each([{ responseChatItemId: 'active-A' }, { reusePreviousAi: true as const }])(
    'preserves the recovery target in both JSON and SSE errors: %o',
    (data) => {
      const error = new ChatGeneratingConflictError(data);
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      jsonRes(res as unknown as Parameters<typeof jsonRes>[0], { code: 409, error });
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusText: ChatErrEnum.chatIsGenerating,
          data
        })
      );
      expect(JSON.parse(getSseErrorResponse(error).data)).toMatchObject({
        statusText: ChatErrEnum.chatIsGenerating,
        data
      });
    }
  );

  it('does not expose arbitrary data attached to ordinary business errors', () => {
    expect(
      processError({
        error: {
          message: ChatErrEnum.chatIsGenerating,
          data: { responseChatItemId: 'untrusted' }
        }
      }).data
    ).toBeNull();
  });

  it.each([MODERATION_BLOCKED_ERROR_MESSAGE, MODERATION_ERROR_BLOCKED_MESSAGE])(
    'marks ChatEntryModerationError with chatEntryModerationBlocked in JSON and SSE while keeping ordinary moderation errors distinct: %s',
    (moderationMessage) => {
      const entryError = new ChatEntryModerationError(moderationMessage);
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      jsonRes(res as unknown as Parameters<typeof jsonRes>[0], { code: 500, error: entryError });
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusText: ChatErrEnum.chatEntryModerationBlocked,
          message: moderationMessage
        })
      );

      const ssePayload = JSON.parse(getSseErrorResponse(entryError).data);
      expect(ssePayload).toMatchObject({
        statusText: ChatErrEnum.chatEntryModerationBlocked,
        message: moderationMessage
      });
      expect(isChatEntryModerationError(ssePayload)).toBe(true);

      const postPersistError = new UserError(moderationMessage);
      const postPersistSsePayload = JSON.parse(getSseErrorResponse(postPersistError).data);
      expect(postPersistSsePayload).toEqual({ message: moderationMessage });
      expect(isChatEntryModerationError(postPersistSsePayload)).toBe(false);
    }
  );
});

function buildZodError() {
  try {
    z.object({ name: z.string() }).parse({});
  } catch (error) {
    return error as z.ZodError;
  }

  throw new Error('Expected zod parse to fail');
}

describe('processError zod logging', () => {
  beforeEach(() => {
    logger.info.mockClear();
    logger.error.mockClear();
  });

  it('does not log request input ZodError through the otel logger', () => {
    const error = new ApiRequestInputParseError(buildZodError(), { inputSource: 'body' });
    const processed = processError({
      error,
      url: '/api/test',
      defaultCode: 400
    });

    expect(processed.httpStatus).toBe(400);
    expect(processed.zodError).toBeTruthy();
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('does not require an api key header context to suppress request input ZodError logs', () => {
    const error = new ApiRequestInputParseError(buildZodError(), { inputSource: 'query' });
    const processed = processError({
      error,
      url: '/api/test',
      defaultCode: 400
    });

    expect(processed.httpStatus).toBe(400);
    expect(processed.zodError).toBeTruthy();
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('keeps unclassified ZodError at error level', () => {
    const error = buildZodError();
    processError({
      error,
      url: '/api/test',
      defaultCode: 500
    });

    expect(logger.error).toHaveBeenCalledWith(
      'Zod validation error',
      expect.objectContaining({
        url: '/api/test',
        error
      })
    );
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('does not log expected user config errors', () => {
    const processed = processError({
      error: new UserConfigError('Invalid MCP URL'),
      url: '/api/test',
      defaultCode: 400
    });

    expect(processed).toMatchObject({
      message: 'Invalid MCP URL',
      httpStatus: 400
    });
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('falls back safely when a serialized user config error has a non-string display message', () => {
    const processed = processError({
      error: {
        name: 'UserConfigError',
        message: 'Invalid API key',
        displayMessage: { text: 'unexpected object' }
      } as any,
      url: '/api/test',
      defaultCode: 400
    });

    expect(processed.message).toBe('Invalid API key');
  });
});

describe('processError HTTP status mapping', () => {
  it('keeps model codes stable while returning specific messages in JSON and SSE', () => {
    const error = new UserError(ModelErrEnum.unExist, 'Model is disabled: GPT-5');
    const processed = processError({ error });
    expect(processed).toMatchObject({
      code: 513000,
      statusText: ModelErrEnum.unExist,
      message: 'Model is disabled: GPT-5'
    });
    expect(JSON.parse(getSseErrorResponse(error).data)).toMatchObject({
      code: 513000,
      statusText: ModelErrEnum.unExist,
      message: 'Model is disabled: GPT-5'
    });
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Parameters<
      typeof jsonRes
    >[0];
    jsonRes(res, { error });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 513000,
        message: 'Model is disabled: GPT-5',
        errorType: 'UserError'
      })
    );
  });
  it('does not trust custom display fields on non-business errors and masks trusted messages', () => {
    expect(
      processError({
        error: Object.assign(new Error(ModelErrEnum.unExist), { displayMessage: 'override' })
      }).message
    ).toBe(ERROR_RESPONSE[ModelErrEnum.unExist].message);
    expect(
      processError({
        error: new UserError(
          ModelErrEnum.unExist,
          'Model type mismatch: https://private.example/model'
        )
      }).message
    ).toBe('Model type mismatch: https://xxx');
    expect(processError({ error: new UserError('custom', '具体提示') }).message).toBe('具体提示');
  });
  it('maps a config UserError to HTTP 400 even when defaultCode is 500', () => {
    const error = new UserConfigError('MCP protocol mismatch');
    const processed = processError({ error, defaultCode: 500 });
    expect(processed.httpStatus).toBe(400);
    expect(processed.code).toBe(400);

    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Parameters<
      typeof jsonRes
    >[0];
    jsonRes(res, { error, code: 500 });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 400,
        message: 'MCP protocol mismatch'
      })
    );
  });

  it('maps a missing file to HTTP 404', () => {
    const processed = processError({
      error: CommonErrEnum.fileNotFound
    });

    expect(processed.code).toBe(507002);
    expect(processed.httpStatus).toBe(404);
  });
});

describe('jsonRes HTTP status mapping', () => {
  const createResponse = () =>
    ({
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    }) as unknown as Parameters<typeof jsonRes>[0];

  it.each([
    [UserErrEnum.invalidVerificationCode, 400],
    [UserErrEnum.sendVerificationCodeTooFrequently, 429],
    [UserErrEnum.verifyCodeTooFrequently, 429],
    [SandboxErrEnum.agentSandboxInitializing, 409],
    [SandboxErrEnum.agentSandboxLimitReached, 409],
    [SandboxErrEnum.agentSandboxTeamLimitReached, 409],
    [AppErrEnum.workflowBuilderVersionExpired, 410],
    [AppErrEnum.workflowBuilderVersionNotFound, 404]
  ] as const)('uses the configured HTTP status for %s', (errorKey, httpStatus) => {
    const res = createResponse();

    jsonRes(res, { code: 500, error: new UserError(errorKey) });

    expect(res.status).toHaveBeenCalledWith(httpStatus);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: ERROR_RESPONSE[errorKey].code,
        statusText: errorKey,
        message: ERROR_RESPONSE[errorKey].message,
        errorType: 'UserError'
      })
    );
  });

  it.each([
    [S3ErrEnum.invalidUploadFileType, 510000],
    [S3ErrEnum.uploadFileTypeMismatch, 510001],
    [S3ErrEnum.fileUploadDisabled, 510002],
    [S3ErrEnum.emptyUploadFile, 510003]
  ] as const)('returns HTTP 400 for registered upload validation error %s', (errorKey, code) => {
    const res = createResponse();

    // 上传代理已经将这些错误分类为 400，JSON 包装不能再覆盖成默认 500。
    jsonRes(res, { code: 400, error: new Error(errorKey) });

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code, statusText: errorKey }));
  });

  it('keeps an explicitly configured server status for an S3 business error', () => {
    const entry = ERROR_RESPONSE[S3ErrEnum.uploadFileTypeMismatch];
    const original = entry.httpStatus;
    const res = createResponse();

    try {
      entry.httpStatus = 503;
      jsonRes(res, { code: 400, error: new Error(S3ErrEnum.uploadFileTypeMismatch) });
      expect(res.status).toHaveBeenCalledWith(503);
    } finally {
      if (original === undefined) delete entry.httpStatus;
      else entry.httpStatus = original;
    }
  });

  it('keeps unregistered internal errors at HTTP 500 even with an S3-range fallback code', () => {
    const res = createResponse();

    jsonRes(res, { code: 510001, error: new Error('Unexpected storage failure') });

    expect(res.status).toHaveBeenCalledWith(500);
  });

  it.each(['httpStatus', 'statusCode'] as const)(
    'does not trust a third-party %s field',
    (statusField) => {
      const res = createResponse();
      const error = Object.assign(new Error('Upstream failure'), { [statusField]: 404 });

      jsonRes(res, { code: 500, error });

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 500 }));
    }
  );
});

describe('getSseErrorResponse logging', () => {
  beforeEach(() => {
    logger.info.mockClear();
    logger.error.mockClear();
  });

  it('keeps UserError out of error-level otel logs', () => {
    const error = new UserError('Invalid stream input');

    const response = getSseErrorResponse(error);

    expect(JSON.parse(response.data)).toEqual({ message: 'Invalid stream input' });
    expect(logger.info).toHaveBeenCalledWith('Request error', {
      url: undefined,
      message: 'Invalid stream input'
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('keeps unexpected SSE failures at error level', () => {
    const error = new Error('Unexpected stream failure');

    const response = getSseErrorResponse(error);

    expect(JSON.parse(response.data)).toEqual({ message: 'Unexpected stream failure' });
    expect(logger.error).toHaveBeenCalledWith('System unexpected error', {
      url: undefined,
      message: 'Unexpected stream failure',
      error
    });
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('keeps specified error responses unchanged for UserError', () => {
    const error = new UserError(ERROR_ENUM.unAuthorization);

    const response = getSseErrorResponse(error);

    expect(JSON.parse(response.data)).toEqual(ERROR_RESPONSE[ERROR_ENUM.unAuthorization]);
    expect(response.shouldClearCookie).toBe(true);
    expect(logger.error).not.toHaveBeenCalled();
  });
});

describe('Provider error response messages', () => {
  it.each([
    { data: { message: 'hourly quota exhausted' }, expected: 'hourly quota exhausted' },
    { data: { msg: '飞书 Token 已过期' }, expected: '飞书 Token 已过期' },
    { data: { errmsg: 'access denied' }, expected: 'access denied' },
    { data: { error: { message: '具体权限缺失' } }, expected: '具体权限缺失' },
    { data: 'upstream text error', expected: 'upstream text error' },
    { data: { message: ' ' }, expected: 'Request failed with status code 429' },
    { data: { message: { unexpected: 'object' } }, expected: 'Request failed with status code 429' }
  ])('JSON 和 SSE 保留响应体原因：$expected', ({ data, expected }) => {
    const error = {
      message: 'Request failed with status code 429',
      response: { status: 429, statusText: 'Too Many Requests', data }
    };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Parameters<
      typeof jsonRes
    >[0];
    jsonRes(res, { code: 500, error });
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 500, message: expected, data: null })
    );
    expect(processError({ error }).shouldClearCookie).toBe(false);
    expect(JSON.parse(getSseErrorResponse(error).data).message).toBe(expected);
  });

  it('上游原因仍经过统一脱敏，不返回请求配置', () => {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Parameters<
      typeof jsonRes
    >[0];
    jsonRes(res, {
      code: 500,
      error: {
        response: { data: { msg: 'request https://private.example/path failed' } },
        config: { headers: { Authorization: 'secret' } }
      }
    });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'request https://xxx failed' })
    );
    expect(JSON.stringify(vi.mocked(res.json).mock.calls)).not.toContain('secret');
  });
});

describe('SSE stream resume mirror', () => {
  it('keeps mirroring events after the original HTTP response is closed', async () => {
    const { createSseStreamContext } = await import('../../../common/response/sse');
    const response = Object.assign(new EventEmitter(), {
      closed: true,
      destroyed: true,
      writableEnded: false,
      headersSent: true,
      setHeader: vi.fn(),
      write: vi.fn(),
      end: vi.fn()
    });
    const mirroredEvents: string[] = [];
    const flushMirror = vi.fn(async () => undefined);
    const context = createSseStreamContext({
      res: response as any,
      streamResumeMirror: {
        enqueueRaw: (event) => {
          mirroredEvents.push(event);
        },
        flush: flushMirror,
        shrinkTTLAfterComplete: vi.fn(async () => undefined)
      }
    });

    context.write({ event: 'answer', data: 'continued output' });
    context.write({ event: 'done', data: '[DONE]' });
    await context.flushResume();

    expect(mirroredEvents).toEqual([
      'event: answer\ndata: continued output\n\n',
      'event: done\ndata: [DONE]\n\n'
    ]);
    expect(flushMirror).toHaveBeenCalledTimes(1);
    expect(response.write).not.toHaveBeenCalled();
  });
});

describe('SSE error response profiling', () => {
  beforeEach(() => {
    profilingMocks.markProfileError.mockClear();
  });

  it('marks the request profile as failed when building an SSE error payload', () => {
    const error = new Error('auth failed');

    const response = getSseErrorResponse(error);

    // 响应载荷保持原样，只是同时把请求标记为失败
    expect(response.event).toBe('error');
    expect(profilingMocks.markProfileError).toHaveBeenCalledWith(error);
  });

  it('marks the request profile as failed when a direct error event is written', () => {
    const res = { write: vi.fn(() => true) };

    responseWrite({ res: res as any, event: 'error', data: '{"message":"node failed"}' });
    expect(profilingMocks.markProfileError).toHaveBeenCalledWith('{"message":"node failed"}');

    profilingMocks.markProfileError.mockClear();
    responseWrite({ res: res as any, event: 'answer', data: 'content' });
    expect(profilingMocks.markProfileError).not.toHaveBeenCalled();
  });

  it('marks the request profile as failed when sseErrRes writes an SSE error', () => {
    const error = new Error('auth failed');
    const res = { write: vi.fn(() => true) };

    sseErrRes(res as any, error);

    expect(res.write).toHaveBeenCalled();
    expect(profilingMocks.markProfileError).toHaveBeenCalledWith(error);
  });
});
