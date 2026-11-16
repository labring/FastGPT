import { describe, expect, it, vi } from 'vitest';
import { getSafeHttpErrorFields, getSafeHttpErrorLog } from '@fastgpt/service/common/api/httpError';

/** 日志摘要不能把未知值或取值异常变为新的业务异常。 */
describe('getSafeHttpErrorFields', () => {
  it.each([undefined, null, 'synthetic-private-value', 42])(
    'returns only fixed diagnostics for %s',
    (error) => {
      expect(getSafeHttpErrorFields({ error, statusSource: 'response' })).toEqual({});
    }
  );

  it('does not invoke serialization and tolerates inaccessible error diagnostics', () => {
    const toJSON = vi.fn(() => 'synthetic-private-value');
    const error = {
      get code() {
        throw new Error('synthetic-private-value');
      },
      toJSON
    };
    expect(getSafeHttpErrorFields({ error, statusSource: 'responseOrDirect' })).toEqual({});
    expect(toJSON).not.toHaveBeenCalled();
  });
});

describe('getSafeHttpErrorLog', () => {
  it('preserves direct status fallback without adding it to response-only diagnostics', () => {
    const directStatus = vi.fn(() => 429);
    const error = {
      code: 'ECONNRESET',
      get status() {
        return directStatus();
      }
    };
    expect(getSafeHttpErrorFields({ error, statusSource: 'response' })).toEqual({
      code: 'ECONNRESET'
    });
    expect(directStatus).not.toHaveBeenCalled();
    expect(getSafeHttpErrorLog(error)).toEqual({
      name: 'HttpRequestError',
      message: 'HTTP request failed',
      code: 'ECONNRESET',
      status: 429
    });
    expect(directStatus).toHaveBeenCalledOnce();
  });

  it('does not replace an invalid response status with a valid direct status', () => {
    const directStatus = vi.fn(() => 429);
    const error = {
      code: 'ERR_BAD_RESPONSE',
      response: { status: 999 },
      get status() {
        return directStatus();
      }
    };
    expect(getSafeHttpErrorLog(error)).toEqual({
      name: 'HttpRequestError',
      message: 'HTTP request failed',
      code: 'ERR_BAD_RESPONSE'
    });
    expect(directStatus).not.toHaveBeenCalled();
  });
});
