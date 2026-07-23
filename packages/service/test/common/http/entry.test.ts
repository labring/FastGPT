import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { ERROR_RESPONSE } from '@fastgpt/global/common/error/errorCode';
import { UserError } from '@fastgpt/global/common/error/utils';

const mocks = vi.hoisted(() => ({
  logger: {
    info: vi.fn(),
    error: vi.fn()
  },
  span: {
    setAttribute: vi.fn()
  },
  setSpanError: vi.fn()
}));

vi.mock('@fastgpt/service/common/logger', () => ({
  getLogger: () => mocks.logger,
  LogCategories: {
    HTTP: {
      REQUEST: 'http.request',
      RESPONSE: 'http.response',
      ERROR: 'http.error'
    }
  },
  withContext: (_context: unknown, callback: () => unknown) => callback()
}));

vi.mock('@fastgpt/service/common/tracing', () => ({
  setSpanError: mocks.setSpanError,
  withActiveSpan: (_options: unknown, callback: (span: typeof mocks.span) => unknown) =>
    callback(mocks.span)
}));

vi.mock('@fastgpt/service/common/security/clientIp', () => ({
  getClientIpFromRequest: () => '127.0.0.1'
}));

vi.mock('@fastgpt/service/support/permission/auth/common', () => ({
  clearCookie: vi.fn()
}));

vi.unmock('@fastgpt/service/common/http/entry');
vi.unmock('@fastgpt/service/common/response');

const { createApiEntry } = await import('../../../common/http/entry');

const createResponse = () => {
  const headers = new Map<string, unknown>();
  const listeners = new Map<string, () => void>();
  const response: any = {
    statusCode: 200,
    writableFinished: false,
    body: undefined,
    setHeader: vi.fn((key: string, value: unknown) => {
      headers.set(key.toLowerCase(), value);
      return response;
    }),
    getHeader: vi.fn((key: string) => headers.get(key.toLowerCase())),
    once: vi.fn((event: string, listener: () => void) => {
      listeners.set(event, listener);
      return response;
    }),
    status: vi.fn((statusCode: number) => {
      response.statusCode = statusCode;
      return response;
    }),
    json: vi.fn((body: unknown) => {
      response.body = body;
      response.writableFinished = true;
      listeners.get('finish')?.();
      return response;
    })
  };

  return response;
};

const request = {
  method: 'POST',
  url: '/api/support/user/verification',
  headers: {},
  body: {},
  query: {},
  socket: { remoteAddress: '127.0.0.1' }
};

describe('createApiEntry error status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    [UserErrEnum.invalidVerificationCode, 400],
    [UserErrEnum.sendVerificationCodeTooFrequently, 429],
    [UserErrEnum.verifyCodeTooFrequently, 429],
    [UserErrEnum.newPasswordSameAsOld, 400]
  ] as const)('returns and traces the configured status for %s', async (errorKey, httpStatus) => {
    const response = createResponse();
    const handler = createApiEntry({})(async () => {
      throw new UserError(errorKey);
    });

    await handler(request as any, response);

    expect(response.statusCode).toBe(httpStatus);
    expect(response.body).toMatchObject({
      code: ERROR_RESPONSE[errorKey].code,
      statusText: errorKey,
      message: ERROR_RESPONSE[errorKey].message,
      errorType: 'UserError'
    });
    expect(mocks.span.setAttribute).toHaveBeenCalledWith('http.response.status_code', httpStatus);
    expect(mocks.setSpanError).not.toHaveBeenCalled();
  });

  it('keeps unexpected failures as traced 500 responses', async () => {
    const response = createResponse();
    const error = new Error('unexpected');
    const handler = createApiEntry({})(async () => {
      throw error;
    });

    await handler(request as any, response);

    expect(response.statusCode).toBe(500);
    expect(mocks.span.setAttribute).toHaveBeenCalledWith('http.response.status_code', 500);
    expect(mocks.setSpanError).toHaveBeenCalledWith(mocks.span, error);
  });
});
