import { beforeEach, describe, expect, it } from 'vitest';
import { usePasswordChangeStore } from '@/web/support/user/account/password/store';

describe('password change session store', () => {
  beforeEach(() => {
    usePasswordChangeStore.getState().setSession(undefined);
  });

  it('keeps the OAuth session only in the non-persisted process store', () => {
    const session = {
      sessionId: 'password-change-session',
      expiredAt: '2026-07-22T08:05:00.000Z',
      required: false
    };

    usePasswordChangeStore.getState().setSession(session);

    expect(usePasswordChangeStore.getState().session).toEqual(session);
    expect('persist' in usePasswordChangeStore).toBe(false);
  });

  it('removes the session when the flow is closed or invalidated', () => {
    usePasswordChangeStore.getState().setSession({
      sessionId: 'password-change-session',
      expiredAt: '2026-07-22T08:05:00.000Z',
      required: true
    });

    usePasswordChangeStore.getState().setSession(undefined);

    expect(usePasswordChangeStore.getState().session).toBeUndefined();
  });
});
