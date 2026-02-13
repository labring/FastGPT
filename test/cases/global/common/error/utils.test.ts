import { describe, expect, it } from 'vitest';
import { getErrText, UserError } from '@fastgpt/global/common/error/utils';
import { ERROR_ENUM, ERROR_RESPONSE } from '@fastgpt/global/common/error/errorCode';

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
});

describe('UserError', () => {
  it('should set name to UserError', () => {
    const err = new UserError('boom');

    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('UserError');
    expect(err.message).toBe('boom');
  });
});
