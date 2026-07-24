import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { SandboxErrEnum } from '@fastgpt/global/common/error/code/sandbox';
import { ERROR_ENUM, ERROR_RESPONSE } from '@fastgpt/global/common/error/errorCode';
import { UserError } from '@fastgpt/global/common/error/utils';
import { ApiRequestInputParseError } from '../../../common/zod/requestParseError';

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

describe('jsonRes business HTTP status', () => {
  const createResponse = () => {
    const response: any = {
      statusCode: 200,
      status: vi.fn((statusCode: number) => {
        response.statusCode = statusCode;
        return response;
      }),
      json: vi.fn()
    };
    return response;
  };

  it.each([
    [UserErrEnum.invalidVerificationCode, 400],
    [UserErrEnum.sendVerificationCodeTooFrequently, 429],
    [UserErrEnum.verifyCodeTooFrequently, 429],
    [UserErrEnum.newPasswordSameAsOld, 400]
  ] as const)('uses the configured HTTP status for %s', (errorKey, httpStatus) => {
    const response = createResponse();

    jsonRes(response, {
      code: 500,
      error: new UserError(errorKey),
      url: '/api/support/user/verification'
    });

    expect(response.status).toHaveBeenCalledWith(httpStatus);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: ERROR_RESPONSE[errorKey].code,
        statusText: errorKey,
        message: ERROR_RESPONSE[errorKey].message,
        errorType: 'UserError'
      })
    );
  });

  it('keeps an unclassified UserError as an internal server error', () => {
    const response = createResponse();

    jsonRes(response, {
      code: 500,
      error: new UserError('unclassified'),
      url: '/api/test'
    });

    expect(response.status).toHaveBeenCalledWith(500);
  });

  it('prefers an explicit HTTP status over a legacy business-code range fallback', () => {
    const response = createResponse();

    jsonRes(response, {
      code: 500,
      error: new UserError(SandboxErrEnum.agentSandboxInitializing),
      url: '/api/core/ai/sandbox'
    });

    expect(response.status).toHaveBeenCalledWith(409);
  });
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
