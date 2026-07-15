import { describe, expect, it } from 'vitest';
import {
  CreateOauthLoginBodySchema,
  OauthLoginBodySchema
} from '@fastgpt/global/openapi/support/user/account/login/api';

describe('OAuth login API contracts', () => {
  it('accepts only OAuth V2 providers and a callback URL', () => {
    expect(
      CreateOauthLoginBodySchema.parse({
        provider: 'github',
        callbackUrl: 'https://fastgpt.example.com/login/provider'
      })
    ).toEqual({
      provider: 'github',
      callbackUrl: 'https://fastgpt.example.com/login/provider',
      isWecomWorkTerminal: false
    });
    expect(
      CreateOauthLoginBodySchema.safeParse({
        provider: 'wechat',
        callbackUrl: 'https://fastgpt.example.com/login/provider'
      }).success
    ).toBe(false);
  });

  it('requires provider, code and server-generated state when consuming OAuth', () => {
    const state = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG';
    expect(
      OauthLoginBodySchema.safeParse({
        provider: 'github',
        callbackUrl: 'https://fastgpt.example.com/login/provider',
        code: 'provider-code',
        state
      }).success
    ).toBe(true);
    expect(
      OauthLoginBodySchema.safeParse({
        type: 'github',
        callbackUrl: 'https://fastgpt.example.com/login/provider',
        props: { code: 'legacy-code' }
      }).success
    ).toBe(false);
  });

  it('limits SSO callback fields and rejects reserved or malformed keys', () => {
    const base = {
      provider: 'sso',
      callbackUrl: 'https://fastgpt.example.com/login/provider',
      code: 'provider-code',
      state: 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG'
    };
    expect(
      OauthLoginBodySchema.safeParse({
        ...base,
        props: Object.fromEntries(
          Array.from({ length: 21 }, (_, index) => [`key${index}`, 'value'])
        )
      }).success
    ).toBe(false);
    expect(
      OauthLoginBodySchema.safeParse({
        ...base,
        props: { value: 'x'.repeat(4097) }
      }).success
    ).toBe(false);
    expect(
      OauthLoginBodySchema.safeParse({ ...base, props: { code: 'cannot-override' } }).success
    ).toBe(false);
    expect(
      OauthLoginBodySchema.safeParse({ ...base, props: { 'invalid key': 'value' } }).success
    ).toBe(false);
  });

  it('rejects unknown top-level OAuth fields', () => {
    expect(
      OauthLoginBodySchema.safeParse({
        provider: 'github',
        callbackUrl: 'https://fastgpt.example.com/login/provider',
        code: 'provider-code',
        state: 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG',
        username: 'forged-user'
      }).success
    ).toBe(false);
  });
});
