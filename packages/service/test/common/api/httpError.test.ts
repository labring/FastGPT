import { describe, expect, it, vi } from 'vitest';
import { getSafeHttpErrorLog } from '@fastgpt/service/common/api/httpError';

/** 日志摘要不能把未知值或取值异常变为新的业务异常。 */
describe('getSafeHttpErrorLog', () => {
  it.each([undefined, null, 'synthetic-private-value', 42])(
    'returns only fixed diagnostics for %s',
    (error) => {
      expect(getSafeHttpErrorLog(error)).toEqual({
        name: 'HttpRequestError',
        message: 'HTTP request failed'
      });
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
    expect(getSafeHttpErrorLog(error)).toEqual({
      name: 'HttpRequestError',
      message: 'HTTP request failed'
    });
    expect(toJSON).not.toHaveBeenCalled();
  });
});
