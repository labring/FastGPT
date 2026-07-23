import { beforeEach, describe, expect, it } from 'vitest';
import { usePasswordChangeStore } from '@/web/support/user/account/password/store';

describe('password change authorization store', () => {
  beforeEach(() => {
    usePasswordChangeStore.getState().setAuthorization(undefined);
  });

  it('keeps the OAuth authorization only in the non-persisted process store', () => {
    const authorization = {
      token: 'password-change-token',
      expiredAt: '2026-07-22T08:05:00.000Z',
      required: false
    };

    usePasswordChangeStore.getState().setAuthorization(authorization);

    expect(usePasswordChangeStore.getState().authorization).toEqual(authorization);
    expect('persist' in usePasswordChangeStore).toBe(false);
  });

  it('removes the token when the flow is closed or invalidated', () => {
    usePasswordChangeStore.getState().setAuthorization({
      token: 'password-change-token',
      expiredAt: '2026-07-22T08:05:00.000Z',
      required: true
    });

    usePasswordChangeStore.getState().setAuthorization(undefined);

    expect(usePasswordChangeStore.getState().authorization).toBeUndefined();
  });
});
