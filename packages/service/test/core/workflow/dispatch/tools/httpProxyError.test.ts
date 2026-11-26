import { describe, expect, it } from 'vitest';
import { createHttpProxyRequestError } from '../../../../../core/workflow/dispatch/tools/httpProxyError';
import { isServerConfigError, isUserConfigError } from '@fastgpt/global/common/error/utils';

describe('safe HTTP proxy failure classification', () => {
  it.each(['EMFILE', 'ENFILE', 'ENOMEM', 'UNKNOWN_FAILURE'])(
    'keeps deepest %s as a system failure without leaking credentials',
    (code) => {
      const raw = Object.assign(new Error('http://user:private@proxy.example.com'), {
        code: 'ECONNRESET',
        cause: { code, config: { password: 'private' } }
      });
      const error = createHttpProxyRequestError(raw, 'GET');
      expect(isServerConfigError(error)).toBe(true);
      expect(error.code).toBe(code);
      expect(JSON.stringify(error)).not.toContain('private');
      expect(error.cause).toBeUndefined();
    }
  );
  it.each(['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ERR_CANCELED'])(
    'keeps %s as a user proxy failure',
    (code) => {
      expect(isUserConfigError(createHttpProxyRequestError({ code }, 'GET'))).toBe(true);
    }
  );
});
