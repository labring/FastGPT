import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiRequestInputParseError } from '../../../common/zod/requestParseError';
import { UserError } from '@fastgpt/global/common/error/utils';
import { ERROR_ENUM, ERROR_RESPONSE } from '@fastgpt/global/common/error/errorCode';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { SandboxErrEnum } from '@fastgpt/global/common/error/code/sandbox';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';

vi.unmock('@fastgpt/service/common/response');

const logger = {
  info: vi.fn(),
  error: vi.fn()
};

vi.mock('@fastgpt/service/common/logger', () => ({
  getLogger: () => logger,
  LogCategories: {
    HTTP: {
      ERROR: 'http.error'
    }
  }
}));

const { getSseErrorResponse, jsonRes, processError } = await import('../../../common/response');

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
    [SandboxErrEnum.agentSandboxInitializing, 409]
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
