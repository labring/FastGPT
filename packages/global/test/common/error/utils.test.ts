import { describe, expect, it } from 'vitest';
import { getErrText, ToastHandledError, UserError } from '@fastgpt/global/common/error/utils';
import { ERROR_ENUM, ERROR_RESPONSE } from '@fastgpt/global/common/error/errorCode';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';

describe('getErrText', () => {
  it('should return mapped message for error enum', () => {
    const result = getErrText(ERROR_ENUM.unAuthorization);

    expect(result).toBe(ERROR_RESPONSE[ERROR_ENUM.unAuthorization].message);
  });

  it('should prefer response.data.message over other fields', () => {
    const err = {
      response: {
        data: {
          message: 'primary message',
          msg: 'fallback data msg'
        },
        message: 'response message',
        msg: 'response msg'
      },
      message: 'base message',
      msg: 'base msg'
    };

    expect(getErrText(err)).toBe('primary message');
  });

  it('should return first axios error message', () => {
    const err = {
      errors: [{ message: 'first axios error' }, { message: 'second axios error' }]
    };

    expect(getErrText(err)).toBe('first axios error');
  });

  it('should fall back to default value', () => {
    expect(getErrText(undefined, 'default message')).toBe('default message');
  });

  it('should mask sensitive text in message', () => {
    const err = {
      message: 'https://example.com/secret ns-abc-123'
    };

    expect(getErrText(err)).toBe('https://xxx xxx');
  });

  it('should parse errorText field', () => {
    const err = {
      errorText: 'Sandbox is not configured'
    };
    expect(getErrText(err)).toBe('Sandbox is not configured');
  });

  it('should use localized reason when locale is provided', () => {
    const err = {
      response: {
        data: {
          error: {
            message: 'English message',
            reason: {
              en: 'English reason',
              'zh-CN': '中文原因'
            }
          }
        }
      }
    };

    expect(getErrText(err, '', 'zh-CN')).toBe('中文原因');
  });

  it('should keep existing nested object behavior when locale is not provided', () => {
    const err = {
      response: {
        data: {
          error: {
            message: 'English message',
            reason: {
              en: 'English reason',
              'zh-CN': '中文原因'
            }
          }
        }
      }
    };

    expect(getErrText(err)).toBe('');
  });
});

describe('UserError', () => {
  it('should set name to UserError', () => {
    const err = new UserError('boom');

    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('UserError');
    expect(err.message).toBe('boom');
  });
});

describe('verification error responses', () => {
  it.each([
    [UserErrEnum.invalidVerificationCode, 400],
    [UserErrEnum.sendVerificationCodeTooFrequently, 429],
    [UserErrEnum.verifyCodeTooFrequently, 429],
    [UserErrEnum.newPasswordSameAsOld, 400]
  ] as const)('maps %s to HTTP %s', (error, httpStatus) => {
    expect(ERROR_RESPONSE[error]).toMatchObject({
      statusText: error,
      httpStatus
    });
  });
});

describe('ToastHandledError', () => {
  it('should set name to ToastHandledError', () => {
    const err = new ToastHandledError('handled');

    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ToastHandledError');
    expect(err.message).toBe('handled');
  });
});
