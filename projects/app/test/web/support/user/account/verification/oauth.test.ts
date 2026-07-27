import { describe, expect, it } from 'vitest';
import { resolveOAuthLoginCallback } from '@/web/support/user/account/verification/oauth';

const callbackUrl = 'https://fastgpt.example.com/login/provider';
const state = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG';

describe('resolveOAuthLoginCallback', () => {
  it('accepts SSO with the matching state', () => {
    expect(
      resolveOAuthLoginCallback({
        loginStore: { provider: 'sso', state, callbackUrl },
        code: 'sso-code',
        state,
        currentCallbackUrl: callbackUrl
      })
    ).toEqual({ provider: 'sso', code: 'sso-code', state });
  });

  it('rejects SSO with a mismatched state', () => {
    expect(
      resolveOAuthLoginCallback({
        loginStore: { provider: 'sso', state, callbackUrl },
        code: 'sso-code',
        state: 'different-state',
        currentCallbackUrl: callbackUrl
      })
    ).toBeUndefined();
  });

  it('accepts legacy SSO without state', () => {
    expect(
      resolveOAuthLoginCallback({
        loginStore: { provider: 'sso', state, callbackUrl },
        code: 'sso-code',
        state: undefined,
        currentCallbackUrl: callbackUrl
      })
    ).toEqual({ provider: 'sso', code: 'sso-code' });
  });

  it('rejects a direct OAuth Provider without state', () => {
    expect(
      resolveOAuthLoginCallback({
        loginStore: { provider: 'github', state, callbackUrl },
        code: 'github-code',
        state: undefined,
        currentCallbackUrl: callbackUrl
      })
    ).toBeUndefined();
  });

  it('accepts a direct OAuth Provider with the matching state', () => {
    expect(
      resolveOAuthLoginCallback({
        loginStore: { provider: 'github', state, callbackUrl },
        code: 'github-code',
        state,
        currentCallbackUrl: callbackUrl
      })
    ).toEqual({ provider: 'github', code: 'github-code', state });
  });

  it('requires login context, a non-empty scalar code and the same callback URL', () => {
    expect(
      resolveOAuthLoginCallback({
        loginStore: undefined,
        code: 'sso-code',
        state: undefined,
        currentCallbackUrl: callbackUrl
      })
    ).toBeUndefined();
    expect(
      resolveOAuthLoginCallback({
        loginStore: { provider: 'sso', state, callbackUrl },
        code: '',
        state: undefined,
        currentCallbackUrl: callbackUrl
      })
    ).toBeUndefined();
    expect(
      resolveOAuthLoginCallback({
        loginStore: { provider: 'sso', state, callbackUrl },
        code: ['sso-code'],
        state: undefined,
        currentCallbackUrl: callbackUrl
      })
    ).toBeUndefined();
    expect(
      resolveOAuthLoginCallback({
        loginStore: { provider: 'sso', state, callbackUrl },
        code: 'sso-code',
        state: undefined,
        currentCallbackUrl: `${callbackUrl}?changed=1`
      })
    ).toBeUndefined();
  });
});
