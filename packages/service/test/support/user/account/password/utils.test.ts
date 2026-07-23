import { describe, expect, it } from 'vitest';
import {
  RECENT_LOGIN_WINDOW_MS,
  isRecentLoginSession
} from '@fastgpt/service/support/user/account/password/utils';

describe('isRecentLoginSession', () => {
  const now = 1_800_000_000_000;

  it.each([0, RECENT_LOGIN_WINDOW_MS])('accepts a session age of %d ms', (age) => {
    expect(isRecentLoginSession({ sessionCreatedAt: now - age, now })).toBe(true);
  });

  it('rejects a session just outside the recent-login window', () => {
    expect(isRecentLoginSession({ sessionCreatedAt: now - RECENT_LOGIN_WINDOW_MS - 1, now })).toBe(
      false
    );
  });

  it.each([undefined, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects an invalid session creation time: %s',
    (sessionCreatedAt) => {
      expect(isRecentLoginSession({ sessionCreatedAt, now })).toBe(false);
    }
  );

  it('rejects a future session and an invalid server clock', () => {
    expect(isRecentLoginSession({ sessionCreatedAt: now + 1, now })).toBe(false);
    expect(isRecentLoginSession({ sessionCreatedAt: now, now: Number.NaN })).toBe(false);
  });
});
