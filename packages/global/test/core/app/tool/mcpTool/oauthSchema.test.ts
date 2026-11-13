import { describe, expect, it } from 'vitest';
import {
  McpToolSetOAuthConfigSchema,
  type McpToolSetOAuthConfigType
} from '@fastgpt/global/core/app/tool/mcpTool/oauthConfig';
import {
  McpOAuthClientModeSchema,
  McpOAuthErrorCodeSchema,
  McpOAuthStatusSchema,
  isValidMcpOAuthScope,
  isMcpOAuthScopeSubset
} from '@fastgpt/global/core/app/tool/mcpTool/oauth';
import {
  McpOAuthCallbackQuerySchema,
  McpOAuthManualClientSchema,
  McpOAuthStartBodySchema
} from '@fastgpt/global/openapi/core/app/mcpTools/oauth';
import {
  CreateMcpToolsBodySchema,
  GetMcpToolsBodySchema,
  RunMcpToolBodySchema,
  UpdateMcpToolsBodySchema
} from '@fastgpt/global/openapi/core/app/mcpTools/api';

const parseOAuth = (input: unknown): McpToolSetOAuthConfigType =>
  McpToolSetOAuthConfigSchema.parse(input);

describe('McpToolSetOAuthConfigSchema', () => {
  it('applies stable defaults', () => {
    expect(parseOAuth({})).toMatchObject({
      schemaVersion: 1,
      clientMode: 'auto',
      credentialSeq: 0
    });
  });

  it('fails closed on unknown schemaVersion', () => {
    expect(McpToolSetOAuthConfigSchema.safeParse({ schemaVersion: 2 }).success).toBe(false);
    expect(McpToolSetOAuthConfigSchema.safeParse({ schemaVersion: 0 }).success).toBe(false);
  });

  it('does not keep removed aliases or rollback fields', () => {
    const parsed = parseOAuth({
      schemaVersion: 1,
      mode: 'oauth',
      oauthMode: 'auto',
      oauthScope: 'read',
      rollback: { enabled: true },
      credentialVersion: 2,
      refreshBackoff: 1000,
      scopeAllowlist: ['read']
    });

    expect(parsed).not.toHaveProperty('mode');
    expect(parsed).not.toHaveProperty('oauthMode');
    expect(parsed).not.toHaveProperty('oauthScope');
    expect(parsed).not.toHaveProperty('rollback');
    expect(parsed).not.toHaveProperty('credentialVersion');
    expect(parsed).not.toHaveProperty('refreshBackoff');
    expect(parsed).not.toHaveProperty('scopeAllowlist');
  });

  it('enforces field boundaries', () => {
    // scope 需同时满足 RFC 6749 语法（单 token ≤512）与整体 1024 上限。
    const maxValidScope = `${'a'.repeat(512)} ${'a'.repeat(511)}`;
    expect(McpToolSetOAuthConfigSchema.safeParse({ scope: maxValidScope }).success).toBe(true);
    expect(
      McpToolSetOAuthConfigSchema.safeParse({ scope: `${'a'.repeat(512)} ${'a'.repeat(512)}` })
        .success
    ).toBe(false);
    expect(McpToolSetOAuthConfigSchema.safeParse({ issuer: 'i'.repeat(2049) }).success).toBe(false);
    expect(McpToolSetOAuthConfigSchema.safeParse({ credentialSeq: -1 }).success).toBe(false);
    expect(McpToolSetOAuthConfigSchema.safeParse({ credentialSeq: 1.5 }).success).toBe(false);
    expect(McpToolSetOAuthConfigSchema.safeParse({ clientMode: 'rollback' }).success).toBe(false);
    expect(
      McpToolSetOAuthConfigSchema.safeParse({
        lastError: {
          code: 'mcp_oauth_refresh_transient',
          at: 1,
          retryable: true,
          retryAfterMs: 86_400_001
        }
      }).success
    ).toBe(false);
  });

  it('rejects malformed endpoints, scopes and error codes', () => {
    // issuer / token 等端点必须是无凭据、无 fragment 的 http(s) URL。
    expect(
      McpToolSetOAuthConfigSchema.safeParse({ issuer: 'https://user:pass@as.example.org/' }).success
    ).toBe(false);
    expect(
      McpToolSetOAuthConfigSchema.safeParse({ issuer: 'https://as.example.org/#fragment' }).success
    ).toBe(false);
    expect(McpToolSetOAuthConfigSchema.safeParse({ issuer: 'ftp://as.example.org/' }).success).toBe(
      false
    );
    expect(
      McpToolSetOAuthConfigSchema.safeParse({ issuer: 'https://as.example.org/' }).success
    ).toBe(true);

    // scope 必须是 RFC 6749 形式，双空格/引号等非法值直接拒绝。
    expect(McpToolSetOAuthConfigSchema.safeParse({ scope: 'read  write' }).success).toBe(false);
    expect(McpToolSetOAuthConfigSchema.safeParse({ scope: 'read"write' }).success).toBe(false);
    expect(McpToolSetOAuthConfigSchema.safeParse({ scope: 'read write' }).success).toBe(true);

    // lastError.code 只接受枚举值，未知 code 不得落库。
    expect(
      McpToolSetOAuthConfigSchema.safeParse({
        lastError: { code: 'unknown_code', at: 1, retryable: false }
      }).success
    ).toBe(false);
    expect(
      McpToolSetOAuthConfigSchema.safeParse({
        lastError: { code: 'mcp_oauth_reauth_required', at: 1, retryable: false }
      }).success
    ).toBe(true);
  });

  it('tolerates null optional server metadata fields from persisted data', () => {
    // 回归：AS 可能返回 `client_id_metadata_document_supported: null`，旧版本 discovery
    // 原样落库后导致 detail/迁移解析失败（nodes[0].toolConfig.mcpToolSet）。
    const parsed = parseOAuth({
      schemaVersion: 1,
      clientMode: 'dcr',
      server: {
        issuer: 'https://as.example.org/',
        authorizationEndpoint: 'https://as.example.org/authorize',
        tokenEndpoint: 'https://as.example.org/token',
        registrationEndpoint: null,
        revocationEndpoint: null,
        tokenEndpointAuthMethodsSupported: null,
        codeChallengeMethodsSupported: null,
        clientIdMetadataDocumentSupported: null,
        scopesSupported: null,
        source: 'discovered',
        fetchedAt: 1
      }
    });

    expect(parsed.server).toMatchObject({
      issuer: 'https://as.example.org/',
      authorizationEndpoint: 'https://as.example.org/authorize',
      tokenEndpoint: 'https://as.example.org/token',
      source: 'discovered',
      fetchedAt: 1
    });
    // 读侧只放宽、不改写：null 被接受并保留；写路径由 discovery 归一为 undefined。
    expect(parsed.server?.clientIdMetadataDocumentSupported).toBeNull();
    expect(parsed.server?.registrationEndpoint).toBeNull();
    expect(parsed.server?.revocationEndpoint).toBeNull();
    expect(parsed.server?.tokenEndpointAuthMethodsSupported).toBeNull();
    expect(parsed.server?.codeChallengeMethodsSupported).toBeNull();
    expect(parsed.server?.scopesSupported).toBeNull();
    // 非空值仍原样保留。
    expect(
      parseOAuth({
        server: {
          issuer: 'https://as.example.org/',
          authorizationEndpoint: 'https://as.example.org/authorize',
          tokenEndpoint: 'https://as.example.org/token',
          clientIdMetadataDocumentSupported: false,
          fetchedAt: 1
        }
      }).server?.clientIdMetadataDocumentSupported
    ).toBe(false);
    // 类型错误仍然被拒绝（null 兼容不等于放宽校验）。
    expect(
      McpToolSetOAuthConfigSchema.safeParse({
        server: {
          issuer: 'https://as.example.org/',
          authorizationEndpoint: 'https://as.example.org/authorize',
          tokenEndpoint: 'https://as.example.org/token',
          clientIdMetadataDocumentSupported: 'yes',
          fetchedAt: 1
        }
      }).success
    ).toBe(false);
  });

  it('tolerates null optional oauth fields from persisted data', () => {
    // 回归（Stage K10）：旧版 client reset 把 `clientSource` 写成 null，schema 只允许
    // cimd|dcr|manual，导致 LegacyMcpToolSetRuntimeConfigSchema 解析失败、detail 500。
    const parsed = parseOAuth({
      schemaVersion: 1,
      clientMode: 'manual',
      clientSource: null,
      issuer: null,
      resource: null,
      scope: null,
      server: null,
      client: null,
      token: null,
      authorizedAt: null,
      authorizedBy: null,
      lastError: null
    });

    expect(parsed.clientSource).toBeNull();
    expect(parsed.issuer).toBeNull();
    expect(parsed.resource).toBeNull();
    expect(parsed.scope).toBeNull();
    expect(parsed.client).toBeNull();
    expect(parsed.token).toBeNull();
    expect(parsed.authorizedAt).toBeNull();
    expect(parsed.authorizedBy).toBeNull();
    // 默认值字段保持原行为。
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.clientMode).toBe('manual');
    expect(parsed.credentialSeq).toBe(0);

    // null 兼容不等于放宽校验：未知来源仍被拒绝。
    expect(McpToolSetOAuthConfigSchema.safeParse({ clientSource: 'bogus' }).success).toBe(false);
    expect(McpToolSetOAuthConfigSchema.safeParse({ resource: 'not-a-url' }).success).toBe(false);
  });

  it('accepts encrypted token and client credentials', () => {
    const parsed = parseOAuth({
      schemaVersion: 1,
      clientMode: 'dcr',
      clientSource: 'dcr',
      client: {
        clientId: 'client-1',
        clientSecret: { secret: 'encrypted-secret' },
        tokenEndpointAuthMethod: 'client_secret_basic',
        registrationAccessToken: { secret: 'encrypted-registration-token' }
      },
      token: {
        secret: {
          access_token: { secret: 'encrypted-access-token' },
          refresh_token: { secret: 'encrypted-refresh-token' }
        },
        tokenType: 'Bearer',
        scope: 'read write',
        expiresAt: 0,
        obtainedAt: 1
      },
      refreshLease: { owner: 'worker-1', expiresAt: 2 },
      revokeLease: null,
      lastError: null,
      authorizedAt: 1,
      authorizedBy: '68ad85a7463006c963799a05'
    });

    expect(parsed.client?.clientId).toBe('client-1');
    expect(parsed.token?.secret.access_token).toEqual({ secret: 'encrypted-access-token' });
    expect(parsed.refreshLease).toEqual({ owner: 'worker-1', expiresAt: 2 });
  });
});

describe('MCP OAuth enums', () => {
  it('supports manual client mode', () => {
    expect(McpOAuthClientModeSchema.options).toEqual(['auto', 'cimd', 'dcr', 'manual']);
  });

  it('exposes exactly the 8 status values', () => {
    expect(McpOAuthStatusSchema.options).toEqual([
      'headers',
      'config_error',
      'client_missing',
      'pending_authorization',
      'authorized',
      'refresh_due',
      'refreshing',
      'reauth_required'
    ]);
  });

  it('removes legacy rollback/allowlist error codes', () => {
    expect(McpOAuthErrorCodeSchema.safeParse('mcp_oauth_disabled').success).toBe(true);
    expect(McpOAuthErrorCodeSchema.safeParse('mcp_oauth_reauth_required').success).toBe(true);
    expect(McpOAuthErrorCodeSchema.safeParse('rollback_blocked').success).toBe(false);
    expect(McpOAuthErrorCodeSchema.safeParse('scope_not_allowed').success).toBe(false);
    expect(McpOAuthErrorCodeSchema.safeParse('schema_unmigrated').success).toBe(false);
  });
});

describe('scope helpers', () => {
  it('validates RFC 6749 scope syntax', () => {
    expect(isValidMcpOAuthScope('')).toBe(true);
    expect(isValidMcpOAuthScope('read')).toBe(true);
    expect(isValidMcpOAuthScope('read write')).toBe(true);
    expect(isValidMcpOAuthScope('read write ')).toBe(false);
    expect(isValidMcpOAuthScope('read  write')).toBe(false);
    expect(isValidMcpOAuthScope('read\twrite')).toBe(false);
    expect(isValidMcpOAuthScope('read"write')).toBe(false);
    expect(isValidMcpOAuthScope(`a${'b'.repeat(512)}`)).toBe(false);
    expect(isValidMcpOAuthScope(Array.from({ length: 32 }, () => 'a').join(' '))).toBe(true);
    expect(isValidMcpOAuthScope(Array.from({ length: 33 }, () => 'a').join(' '))).toBe(false);
  });

  it('rejects scope widening', () => {
    expect(isMcpOAuthScopeSubset('read', 'read write')).toBe(true);
    expect(isMcpOAuthScopeSubset('', 'read')).toBe(true);
    expect(isMcpOAuthScopeSubset('read', 'read')).toBe(true);
    expect(isMcpOAuthScopeSubset('admin', 'read write')).toBe(false);
    expect(isMcpOAuthScopeSubset('read', '')).toBe(false);
  });
});

describe('MCP OAuth route schemas', () => {
  it('requires a secret for confidential manual clients', () => {
    expect(McpOAuthManualClientSchema.safeParse({ clientId: 'client-1' }).success).toBe(false);
    expect(
      McpOAuthManualClientSchema.safeParse({
        clientId: 'client-1',
        tokenEndpointAuthMethod: 'none'
      }).success
    ).toBe(true);
    expect(
      McpOAuthManualClientSchema.safeParse({
        clientId: 'client-1',
        clientSecret: 'secret',
        tokenEndpointAuthMethod: 'client_secret_post'
      }).success
    ).toBe(true);
    // start body 复用同一契约，manual 缺 secret 在入口即被拒绝。
    expect(
      McpOAuthStartBodySchema.safeParse({
        appId: '68ad85a7463006c963799a05',
        clientMode: 'manual',
        manualClient: { clientId: 'client-1' }
      }).success
    ).toBe(false);
  });

  it('accepts callback state up to the shared HTTP header safe cap', () => {
    expect(McpOAuthCallbackQuerySchema.safeParse({ state: 'a'.repeat(8192) }).success).toBe(true);
    expect(McpOAuthCallbackQuerySchema.safeParse({ state: 'a'.repeat(8 * 1024) }).success).toBe(
      true
    );
    expect(McpOAuthCallbackQuerySchema.safeParse({ state: 'a'.repeat(8 * 1024 + 1) }).success).toBe(
      false
    );
  });
});

describe('MCP tools API schemas', () => {
  const url = 'https://mcp.example.com/mcp';
  const appId = '68ad85a7463006c963799a05';
  const toolList = [{ name: 'search', description: 'Search tool' }];

  it('allows empty toolList only in oauth mode on create', () => {
    expect(
      CreateMcpToolsBodySchema.safeParse({ name: 'tools', url, authMode: 'oauth', toolList: [] })
        .success
    ).toBe(true);
    expect(
      CreateMcpToolsBodySchema.safeParse({ name: 'tools', url, authMode: 'oauth' }).success
    ).toBe(true);

    expect(
      CreateMcpToolsBodySchema.safeParse({ name: 'tools', url, authMode: 'headers', toolList: [] })
        .success
    ).toBe(false);

    const parsed = CreateMcpToolsBodySchema.parse({
      name: 'tools',
      url,
      toolList
    });
    expect(parsed.authMode).toBe('headers');
  });

  it('accepts oauth fields on update', () => {
    const parsed = UpdateMcpToolsBodySchema.parse({
      appId,
      url,
      toolList: [],
      authMode: 'oauth',
      clientMode: 'manual',
      scope: 'read write'
    });

    expect(parsed).toMatchObject({
      authMode: 'oauth',
      clientMode: 'manual',
      scope: 'read write'
    });
  });

  it('rejects headers auth with an empty toolList on update', () => {
    // 与 create 保持一致：headers 模式必须保留至少一个工具，避免保存出不可运行的工具集。
    expect(
      UpdateMcpToolsBodySchema.safeParse({ appId, url, toolList: [], authMode: 'headers' }).success
    ).toBe(false);
    expect(
      UpdateMcpToolsBodySchema.safeParse({ appId, url, toolList, authMode: 'headers' }).success
    ).toBe(true);
    expect(
      UpdateMcpToolsBodySchema.safeParse({ appId, url, toolList: [], authMode: 'oauth' }).success
    ).toBe(true);
  });

  it('requires appId or url for get/run', () => {
    expect(GetMcpToolsBodySchema.safeParse({}).success).toBe(false);
    expect(GetMcpToolsBodySchema.safeParse({ appId }).success).toBe(true);
    expect(GetMcpToolsBodySchema.safeParse({ url }).success).toBe(true);

    expect(RunMcpToolBodySchema.safeParse({ toolName: 'search', params: {} }).success).toBe(false);
    expect(RunMcpToolBodySchema.safeParse({ appId, toolName: 'search', params: {} }).success).toBe(
      true
    );
    expect(RunMcpToolBodySchema.safeParse({ url, toolName: 'search', params: {} }).success).toBe(
      true
    );
  });
});
