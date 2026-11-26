import { describe, expect, it } from 'vitest';
import {
  McpOAuthStartResponseSchema,
  McpOAuthStatusResponseSchema
} from '@fastgpt/global/openapi/core/app/mcpTools/oauth';
import { McpOAuthStatusEnum } from '@fastgpt/global/core/app/tool/mcpTool/oauth';
import { deriveMcpOAuthStatus } from '@fastgpt/service/core/app/mcpOAuth/credential';
import { encryptSecretValue } from '@fastgpt/service/common/secret/utils';

/**
 * status / start 响应契约。
 *
 * 1. status 顶层字段集与约定枚举完全一致；
 * 2. 任何 token / refresh token / client secret / registration access token
 *    都不得出现在响应中；
 * 3. 8 个状态都可从 deriveMcpOAuthStatus 派生。
 */

/** 约定的 status 顶层字段（共 22 个）。 */
const HANDOFF_STATUS_FIELDS = [
  'schemaVersion',
  'state',
  'authMode',
  'clientMode',
  'clientSource',
  'issuer',
  'resource',
  'scope',
  'requestedScope',
  'authorized',
  'hasAccessToken',
  'hasRefreshToken',
  'hasClientSecret',
  'expiresAt',
  'refreshDueAt',
  'authorizedAt',
  'authorizedBy',
  'lastError',
  'canStart',
  'canDisconnect',
  'canResetClient',
  'updatedAt'
].sort();

const HANDOFF_START_FIELDS = [
  'schemaVersion',
  'authorizationUrl',
  'clientMode',
  'clientSource',
  'issuer',
  'resource',
  'requestedScope',
  'expiresAt'
].sort();

/** 递归收集对象键，用于断言“不存在任何 secret 字段”。 */
const collectKeys = (value: unknown, keys: Set<string> = new Set()): Set<string> => {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys);
    return keys;
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      keys.add(key);
      collectKeys(item, keys);
    }
  }
  return keys;
};

const FORBIDDEN_STATUS_KEYS = [
  'token',
  'secret',
  'access_token',
  'refresh_token',
  'clientSecret',
  'registrationAccessToken',
  'codeVerifier',
  'bindCookieHash',
  'oauth'
];

const baseOAuth = {
  schemaVersion: 1 as const,
  clientMode: 'auto' as const,
  credentialSeq: 0,
  client: { clientId: 'client-1', tokenEndpointAuthMethod: 'none' as const },
  server: {
    issuer: 'https://as.example.org/',
    authorizationEndpoint: 'https://as.example.org/authorize',
    tokenEndpoint: 'https://as.example.org/token',
    source: 'discovered' as const,
    fetchedAt: 0
  }
};

const token = {
  secret: {
    access_token: encryptSecretValue({ value: 'access-token-value' }),
    refresh_token: encryptSecretValue({ value: 'refresh-token-value' })
  },
  expiresAt: 2_000_000,
  obtainedAt: 0
};

describe('MCP OAuth status 响应契约', () => {
  it('schema 字段集与约定完全一致（22 个顶层字段）', () => {
    expect(Object.keys(McpOAuthStatusResponseSchema.shape).sort()).toEqual(HANDOFF_STATUS_FIELDS);
  });

  it('序列化后的 status 不含任何 token/secret 键', () => {
    const status = deriveMcpOAuthStatus({
      authMode: 'oauth',
      toolSet: { url: 'https://example.org/mcp' },
      oauth: { ...baseOAuth, token },
      now: 1_000_000
    });
    const parsed = McpOAuthStatusResponseSchema.parse(status);
    const keys = collectKeys(JSON.parse(JSON.stringify(parsed)));

    for (const forbidden of FORBIDDEN_STATUS_KEYS) {
      expect(keys.has(forbidden), `status leaked ${forbidden}`).toBe(false);
    }
    expect(Object.keys(parsed).sort()).toEqual(HANDOFF_STATUS_FIELDS);
  });

  it('8 个状态都能派生，且投影仍满足 schema', () => {
    const toolSet = { url: 'https://example.org/mcp' };
    const cases = [
      deriveMcpOAuthStatus({ authMode: 'headers', toolSet: {}, oauth: undefined }),
      deriveMcpOAuthStatus({ authMode: 'oauth', toolSet, oauth: undefined }),
      deriveMcpOAuthStatus({
        authMode: 'oauth',
        toolSet,
        oauth: { ...baseOAuth, client: undefined }
      }),
      deriveMcpOAuthStatus({
        authMode: 'oauth',
        toolSet,
        oauth: { ...baseOAuth, token },
        hasPendingState: true,
        now: 1_000_000
      }),
      deriveMcpOAuthStatus({
        authMode: 'oauth',
        toolSet,
        oauth: { ...baseOAuth, token },
        now: 1_000_000
      }),
      deriveMcpOAuthStatus({
        authMode: 'oauth',
        toolSet,
        oauth: { ...baseOAuth, token: { ...token, expiresAt: 1_010_000 } },
        now: 1_000_000
      }),
      deriveMcpOAuthStatus({
        authMode: 'oauth',
        toolSet,
        oauth: { ...baseOAuth, refreshLease: { owner: 'x', expiresAt: 1_010_000 } },
        now: 1_000_000
      }),
      deriveMcpOAuthStatus({
        authMode: 'oauth',
        toolSet,
        oauth: {
          ...baseOAuth,
          token,
          lastError: { code: 'mcp_oauth_reauth_required', at: 0, retryable: false }
        },
        now: 1_000_000
      })
    ];

    const states = new Set(cases.map((item) => item.state));
    for (const state of Object.values(McpOAuthStatusEnum)) {
      expect(states.has(state), `state ${state} is not reachable`).toBe(true);
    }
    for (const item of cases) {
      expect(() => McpOAuthStatusResponseSchema.parse(item)).not.toThrow();
    }
  });
});

describe('MCP OAuth start 响应契约', () => {
  it('字段集与约定一致，且不含 state/PKCE/token', () => {
    expect(Object.keys(McpOAuthStartResponseSchema.shape).sort()).toEqual(HANDOFF_START_FIELDS);
    const keys = new Set(Object.keys(McpOAuthStartResponseSchema.shape));
    for (const forbidden of ['state', 'codeVerifier', 'codeChallenge', 'token', 'secret']) {
      expect(keys.has(forbidden), `start response defined ${forbidden}`).toBe(false);
    }
  });
});
