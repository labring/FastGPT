import { afterEach, describe, expect, it } from 'vitest';
import {
  decryptMcpOAuthAccessToken,
  decryptMcpOAuthRefreshToken,
  exchangeMcpOAuthAuthorizationCode,
  isMcpOAuthAccessTokenUsable,
  refreshMcpOAuthAccessToken,
  resetMcpOAuthFetchImpl,
  revokeMcpOAuthToken,
  setMcpOAuthFetchImpl
} from '@fastgpt/service/core/app/mcpOAuth';
import { McpOAuthApiError } from '@fastgpt/service/core/app/mcpOAuth/errors';
import { encryptSecretValue } from '@fastgpt/service/common/secret/utils';
import { McpOAuthErrorCodeEnum } from '@fastgpt/global/core/app/tool/mcpTool/oauth';
import type { McpOAuthTokenType } from '@fastgpt/global/core/app/tool/mcpTool/oauthConfig';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers }
  });

const base = {
  tokenEndpoint: 'https://example.org/token',
  clientId: 'client-id',
  authMethod: 'none' as const,
  resource: 'https://mcp.example.org/mcp'
};

const asOAuthError = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error as McpOAuthApiError;
  }
  throw new Error('Expected promise to reject');
};

describe('mcpOAuth token', () => {
  afterEach(() => resetMcpOAuthFetchImpl());

  it('exchanges an authorization code and encrypts both tokens', async () => {
    setMcpOAuthFetchImpl(async (_url, init) => {
      const body = new URLSearchParams(String(init?.body));
      expect(body.get('grant_type')).toBe('authorization_code');
      expect(body.get('code_verifier')).toBe('v'.repeat(64));
      expect(body.get('resource')).toBe(base.resource);
      return json({
        access_token: 'access-1',
        token_type: 'Bearer',
        expires_in: 600,
        refresh_token: 'refresh-1',
        scope: 'read'
      });
    });

    const token = await exchangeMcpOAuthAuthorizationCode({
      ...base,
      code: 'code-1',
      redirectUri: 'https://example.com/callback',
      codeVerifier: 'v'.repeat(64),
      requestedScope: 'read write',
      now: 1_000_000
    });

    expect(token.expiresAt).toBe(1_600_000);
    expect(token.scope).toBe('read');
    expect(decryptMcpOAuthAccessToken(token)).toBe('access-1');
    expect(decryptMcpOAuthRefreshToken(token)).toBe('refresh-1');
    expect(JSON.stringify(token.secret.access_token)).not.toContain('access-1');
  });

  it('rejects non-Bearer token types', async () => {
    setMcpOAuthFetchImpl(async () =>
      json({ access_token: 'a', token_type: 'mac', expires_in: 60 })
    );
    const error = await asOAuthError(
      exchangeMcpOAuthAuthorizationCode({
        ...base,
        code: 'c',
        redirectUri: 'https://example.com/callback',
        codeVerifier: 'v'.repeat(64)
      })
    );
    expect(error.oauthCode).toBe(McpOAuthErrorCodeEnum.exchangeFailed);
  });

  it('rejects scope widening', async () => {
    setMcpOAuthFetchImpl(async () =>
      json({ access_token: 'a', token_type: 'Bearer', scope: 'read write' })
    );
    const error = await asOAuthError(
      exchangeMcpOAuthAuthorizationCode({
        ...base,
        code: 'c',
        redirectUri: 'https://example.com/callback',
        codeVerifier: 'v'.repeat(64),
        requestedScope: 'read'
      })
    );
    expect(error.oauthCode).toBe(McpOAuthErrorCodeEnum.scopeWidened);
  });

  it('accepts the AS default scope when no scope was requested', async () => {
    setMcpOAuthFetchImpl(async () =>
      json({ access_token: 'a', token_type: 'Bearer', scope: 'default read' })
    );

    const exchanged = await exchangeMcpOAuthAuthorizationCode({
      ...base,
      code: 'c',
      redirectUri: 'https://example.com/callback',
      codeVerifier: 'v'.repeat(64)
    });
    expect(exchanged.scope).toBe('default read');

    const refreshed = await refreshMcpOAuthAccessToken({
      ...base,
      refreshToken: 'r'
    });
    expect(refreshed.scope).toBe('default read');
  });

  it('preserves the previous refresh token when the AS does not rotate it', async () => {
    const previous: McpOAuthTokenType = {
      secret: {
        access_token: encryptSecretValue({ value: 'old-access' }),
        refresh_token: encryptSecretValue({ value: 'old-refresh' })
      },
      expiresAt: 0,
      obtainedAt: 0
    };
    setMcpOAuthFetchImpl(async (_url, init) => {
      const body = new URLSearchParams(String(init?.body));
      expect(body.get('grant_type')).toBe('refresh_token');
      expect(body.get('scope')).toBeNull();
      return json({ access_token: 'new-access', token_type: 'bearer', expires_in: 120 });
    });

    const token = await refreshMcpOAuthAccessToken({
      ...base,
      refreshToken: 'old-refresh',
      requestedScope: 'read',
      previousToken: previous,
      now: 2_000_000
    });
    expect(decryptMcpOAuthAccessToken(token)).toBe('new-access');
    expect(decryptMcpOAuthRefreshToken(token)).toBe('old-refresh');
  });

  it('maps invalid_grant to reauth_required', async () => {
    setMcpOAuthFetchImpl(async () => json({ error: 'invalid_grant' }, 400));
    const error = await asOAuthError(refreshMcpOAuthAccessToken({ ...base, refreshToken: 'dead' }));
    expect(error.oauthCode).toBe(McpOAuthErrorCodeEnum.reauthRequired);
  });

  it('maps 429/5xx to refresh_transient with Retry-After', async () => {
    setMcpOAuthFetchImpl(async () =>
      json({ error: 'temporarily_unavailable' }, 503, { 'retry-after': '2' })
    );
    const error = await asOAuthError(refreshMcpOAuthAccessToken({ ...base, refreshToken: 'rt' }));
    expect(error.oauthCode).toBe(McpOAuthErrorCodeEnum.refreshTransient);
    expect(error.retryAfterMs).toBe(2000);
  });

  it('revokes with RFC 7009 form encoding', async () => {
    setMcpOAuthFetchImpl(async (_url, init) => {
      const body = new URLSearchParams(String(init?.body));
      expect(body.get('token')).toBe('access-1');
      expect(body.get('token_type_hint')).toBe('access_token');
      return json({}, 200);
    });
    await expect(
      revokeMcpOAuthToken({
        revocationEndpoint: 'https://example.org/revoke',
        clientId: 'client-id',
        authMethod: 'none',
        token: 'access-1',
        tokenTypeHint: 'access_token'
      })
    ).resolves.toBe(true);
  });

  it('treats expiresAt=0 as usable until a 401 occurs', () => {
    const token: McpOAuthTokenType = {
      secret: { access_token: encryptSecretValue({ value: 'a' }) },
      expiresAt: 0,
      obtainedAt: 0
    };
    expect(isMcpOAuthAccessTokenUsable(token, { now: 1_000_000 })).toBe(true);
    expect(isMcpOAuthAccessTokenUsable(token, { now: 1_000_000, marginMs: 30_000 })).toBe(true);
  });
});
