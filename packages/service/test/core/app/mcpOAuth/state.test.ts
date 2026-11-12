import { afterEach, describe, expect, it } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import {
  buildMcpOAuthState,
  buildMcpOAuthCallbackRedirect,
  clearMcpOAuthBindCookie,
  consumeMcpOAuthState,
  expirePendingMcpOAuthStates,
  getMcpOAuthBindCookieName,
  isMcpOAuthCallbackRedirectAllowed,
  parseMcpOAuthState,
  readCookie,
  serializeMcpOAuthBindCookie,
  sha256Hex,
  writeMcpOAuthState
} from '@fastgpt/service/core/app/mcpOAuth';
import { McpOAuthApiError } from '@fastgpt/service/core/app/mcpOAuth/errors';
import { MongoMcpOAuthState } from '@fastgpt/service/core/app/mcpOAuth/schema';
import {
  MCP_OAUTH_STATE_MAX_LENGTH,
  McpOAuthErrorCodeEnum
} from '@fastgpt/global/core/app/tool/mcpTool/oauth';

const ids = () => ({
  appId: new Types.ObjectId().toString(),
  nodeId: 'node-1',
  teamId: new Types.ObjectId().toString(),
  tmbId: new Types.ObjectId().toString()
});

const build = (overrides: Record<string, unknown> = {}) => {
  const base = ids();
  return buildMcpOAuthState({
    ...base,
    redirectUri: 'https://fastgpt.example.com/api/core/app/mcpTools/oauth/callback',
    codeVerifier: 'a'.repeat(64),
    issuer: 'https://as.example.org/',
    resource: 'https://mcp.example.org/mcp',
    clientIdHash: sha256Hex('client-id'),
    ...overrides
  });
};

const asOAuthError = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error as McpOAuthApiError;
  }
  throw new Error('Expected promise to reject');
};

describe('mcpOAuth state', () => {
  afterEach(async () => {
    await MongoMcpOAuthState.deleteMany({});
  });

  it('encrypts the payload and decrypts it without leaking the nonce', () => {
    const built = build();
    expect(built.state).not.toContain(built.payload.n);
    expect(parseMcpOAuthState(built.state)).toMatchObject({
      appId: built.payload.appId,
      issuer: 'https://as.example.org/',
      resource: 'https://mcp.example.org/mcp'
    });
    expect(parseMcpOAuthState(built.state).scope).toBeUndefined();
  });

  it('rejects expired state', () => {
    const built = build({ ttlMs: 1000, now: 1_000_000 });
    let error: McpOAuthApiError | undefined;
    try {
      parseMcpOAuthState(built.state, { now: 1_002_000 });
    } catch (caught) {
      error = caught as McpOAuthApiError;
    }
    expect(error?.oauthCode).toBe(McpOAuthErrorCodeEnum.stateExpired);
  });

  it('consumes atomically: concurrent callbacks produce one winner and one replay', async () => {
    const built = build();
    await writeMcpOAuthState({ payload: built.payload, bindCookieHash: sha256Hex('cookie') });

    const results = await Promise.allSettled([
      consumeMcpOAuthState({ stateHash: built.stateHash }),
      consumeMcpOAuthState({ stateHash: built.stateHash })
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(
      (result) => result.status === 'rejected'
    ) as PromiseRejectedResult;
    expect((rejected.reason as McpOAuthApiError).oauthCode).toBe(
      McpOAuthErrorCodeEnum.stateReplayed
    );
  });

  it('invalidates previous pending state on a new start', async () => {
    const base = ids();
    const first = build(base);
    const second = build(base);
    await writeMcpOAuthState({ payload: first.payload, bindCookieHash: sha256Hex('c1') });
    await writeMcpOAuthState({ payload: second.payload, bindCookieHash: sha256Hex('c2') });

    await expirePendingMcpOAuthStates(base);

    const error = await asOAuthError(consumeMcpOAuthState({ stateHash: first.stateHash }));
    expect(error.oauthCode).toBe(McpOAuthErrorCodeEnum.stateReplayed);
  });

  it('round-trips the largest state that fits the HTTP header safe cap', () => {
    const scope = Array.from({ length: 500 }, () => 's').join('');
    const redirectUri = `https://fastgpt.example.com/callback?payload=${'r'.repeat(1000)}`;
    const issuer = `https://as.example.org/${'i'.repeat(600)}`;
    const built = build({ scope, redirectUri, issuer });

    // 必须大于旧的 4KB 回调上限，同时不超过 HTTP 头安全值（nginx 默认 8KB）。
    expect(built.state.length).toBeGreaterThan(4096);
    expect(built.state.length).toBeLessThanOrEqual(MCP_OAUTH_STATE_MAX_LENGTH);
    expect(parseMcpOAuthState(built.state)).toMatchObject({ scope, redirectUri, issuer });
  });

  it('rejects a schema-max payload whose worst-case state exceeds the header safe cap', () => {
    let error: McpOAuthApiError | undefined;
    try {
      build({
        scope: 's'.repeat(1024),
        redirectUri: `https://fastgpt.example.com/callback?payload=${'r'.repeat(2048)}`,
        issuer: `https://as.example.org/${'i'.repeat(2048)}`,
        resource: `https://mcp.example.org/${'x'.repeat(2048)}`
      });
    } catch (caught) {
      error = caught as McpOAuthApiError;
    }

    // 预校验必须给出可读错误，而不是先加密/写库再发现回调无法投递。
    expect(error?.oauthCode).toBe(McpOAuthErrorCodeEnum.stateInvalid);
    expect(error?.message).toMatch(/HTTP header safe limit/);
  });

  it('marks previous pending states consumed without expiring purgeAt', async () => {
    const base = ids();
    const first = build(base);
    const second = build(base);
    await writeMcpOAuthState({ payload: first.payload, bindCookieHash: sha256Hex('c1') });
    await writeMcpOAuthState({ payload: second.payload, bindCookieHash: sha256Hex('c2') });

    const now = Date.now();
    await expirePendingMcpOAuthStates({ ...base, now });

    const docs = await MongoMcpOAuthState.find({ appId: base.appId }).lean();
    expect(docs).toHaveLength(2);
    for (const doc of docs) {
      expect(doc.consumedAt).toBeInstanceOf(Date);
      // 保留原 purgeAt（写入时间 + 24h），不得改成 now 让 TTL 立即清理。
      expect(doc.purgeAt.getTime()).toBeGreaterThan(now);
    }
  });

  it('serializes and clears the binding cookie with the fixed path', () => {
    const cookie = serializeMcpOAuthBindCookie({
      appId: 'abc',
      value: 'binding',
      feDomain: 'https://fastgpt.example.com'
    });
    expect(cookie).toBe(
      'mcp_oauth_bind_abc=binding; Path=/api/core/app/mcpTools/oauth; Max-Age=600; HttpOnly; SameSite=Lax; Secure'
    );
    expect(
      clearMcpOAuthBindCookie({ appId: 'abc', feDomain: 'http://localhost:3000' })
    ).not.toContain('Secure');
    expect(readCookie(cookie, getMcpOAuthBindCookieName('abc'))).toBe('binding');
  });

  it('only redirects to the fixed detail page with enumerated params', () => {
    const appId = new Types.ObjectId().toString();
    const url = buildMcpOAuthCallbackRedirect({
      feDomain: 'https://fastgpt.example.com',
      appId,
      success: false,
      code: McpOAuthErrorCodeEnum.accessDenied
    });
    expect(isMcpOAuthCallbackRedirectAllowed(url, 'https://fastgpt.example.com')).toBe(true);
    expect(url).toContain(`appId=${appId}`);
    expect(url).toContain('oauth=error');
    expect(
      isMcpOAuthCallbackRedirectAllowed(
        'https://fastgpt.example.com/evil?appId=x',
        'https://fastgpt.example.com'
      )
    ).toBe(false);
    expect(
      isMcpOAuthCallbackRedirectAllowed(
        'https://fastgpt.example.com/app/detail?appId=x&next=https://evil.example.com',
        'https://fastgpt.example.com'
      )
    ).toBe(false);
  });
});
