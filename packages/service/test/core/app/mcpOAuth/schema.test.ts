import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { getRedisRuntime } from '@fastgpt/dal/redis/runtime';
import { rateLimitCache } from '@fastgpt/dal/redis/caches';
import * as mcpOAuthSchemaModule from '@fastgpt/service/core/app/mcpOAuth/schema';
import {
  MCP_OAUTH_NODE_MAX_BYTES,
  MCP_OAUTH_REFRESH_LEASE_MS,
  MCP_OAUTH_STATE_PURGE_MS,
  MCP_OAUTH_STATE_TTL_MS,
  McpOAuthStateCollectionName,
  McpOAuthStateSchema,
  MongoMcpOAuthState
} from '@fastgpt/service/core/app/mcpOAuth/schema';
import {
  assertMcpOAuthCallbackByAppRateLimit,
  assertMcpOAuthCallbackByIpRateLimit,
  assertMcpOAuthClientMetadataByIpRateLimit,
  assertMcpOAuthClientResetByAppRateLimit,
  assertMcpOAuthDisconnectByAppRateLimit,
  assertMcpOAuthStartByAppRateLimit,
  assertMcpOAuthStartByUserRateLimit,
  getMcpOAuthIpRateLimitSegment
} from '@fastgpt/service/common/rateLimit/interface/mcpOAuth';

const getRedisConnection = () => getRedisRuntime().getCommandConnection();

const getIndexKeys = () =>
  McpOAuthStateSchema.indexes().map(([key, options]) => ({ key, options }));

describe('mcp_oauth_states schema', () => {
  it('declares exactly one collection', () => {
    expect(McpOAuthStateCollectionName).toBe('mcp_oauth_states');
    expect(MongoMcpOAuthState.collection.collectionName).toBe('mcp_oauth_states');
    expect(McpOAuthStateSchema.options.collection).toBe('mcp_oauth_states');

    const stringExports = Object.values(mcpOAuthSchemaModule).filter(
      (value): value is string => typeof value === 'string'
    );
    expect(stringExports).toEqual(['mcp_oauth_states']);
  });

  it('declares the TTL purge index and lookup indexes', () => {
    const indexes = getIndexKeys();

    const purgeIndex = indexes.find(
      (index) => JSON.stringify(index.key) === JSON.stringify({ purgeAt: 1 })
    );
    expect(purgeIndex?.options).toMatchObject({ expireAfterSeconds: 0 });

    expect(indexes.map((index) => JSON.stringify(index.key))).toEqual(
      expect.arrayContaining([
        JSON.stringify({ appId: 1, createdAt: -1 }),
        JSON.stringify({ appId: 1, nodeId: 1, expiresAt: 1 })
      ])
    );
  });

  it('keeps design constants', () => {
    expect(MCP_OAUTH_STATE_TTL_MS).toBe(10 * 60 * 1000);
    expect(MCP_OAUTH_STATE_PURGE_MS).toBe(24 * 60 * 60 * 1000);
    expect(MCP_OAUTH_REFRESH_LEASE_MS).toBe(45 * 1000);
    expect(MCP_OAUTH_NODE_MAX_BYTES).toBe(16 * 1024);
  });

  it('stores nonce and cookie hashes, never plaintext state', () => {
    const paths = Object.keys(McpOAuthStateSchema.paths);
    expect(paths).toEqual(
      expect.arrayContaining([
        '_id',
        'v',
        'appId',
        'teamId',
        'nodeId',
        'tmbId',
        'bindCookieHash',
        'issuer',
        'resource',
        'clientIdHash',
        'redirectUri',
        'createdAt',
        'expiresAt',
        'purgeAt',
        'consumedAt'
      ])
    );
    expect(paths).not.toEqual(expect.arrayContaining(['state', 'codeVerifier', 'token']));
  });
});

describe('MCP OAuth rate limit policies', () => {
  beforeEach(async () => {
    await getRedisConnection().flushdb();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses start-app 5/60s with app key', async () => {
    const consume = vi.spyOn(rateLimitCache, 'consume');
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => assertMcpOAuthStartByAppRateLimit({ appId: 'app-1' }))
    );

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(5);
    expect(results.filter((result) => result.status === 'rejected')).toEqual([
      { status: 'rejected', reason: ERROR_ENUM.tooManyRequest }
    ]);
    expect(consume).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'rate-limit:mcp-oauth:start-app:app:app-1',
        limit: 5,
        windowSeconds: 60
      })
    );
  });

  it('uses start-user 20/60s with user key', async () => {
    const consume = vi.spyOn(rateLimitCache, 'consume');
    await assertMcpOAuthStartByUserRateLimit({ tmbId: 'tmb-1' });

    expect(consume).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'rate-limit:mcp-oauth:start-user:user:tmb-1',
        limit: 20,
        windowSeconds: 60
      })
    );
  });

  it('hashes callback/metadata IPs and keeps callback-app 60/60s', async () => {
    const consume = vi.spyOn(rateLimitCache, 'consume');
    await assertMcpOAuthCallbackByIpRateLimit({ ip: '192.0.2.10' });
    await assertMcpOAuthCallbackByAppRateLimit({ appId: 'app-2' });
    await assertMcpOAuthClientMetadataByIpRateLimit({ ip: '192.0.2.11' });

    const ipHash = getMcpOAuthIpRateLimitSegment('192.0.2.10');
    expect(consume).toHaveBeenCalledWith(
      expect.objectContaining({
        key: `rate-limit:mcp-oauth:callback-ip:ip:${ipHash}`,
        limit: 30,
        windowSeconds: 60
      })
    );
    expect(consume).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'rate-limit:mcp-oauth:callback-app:app:app-2',
        limit: 60,
        windowSeconds: 60
      })
    );
    expect(consume).toHaveBeenCalledWith(
      expect.objectContaining({
        key: `rate-limit:mcp-oauth:client-metadata-ip:ip:${getMcpOAuthIpRateLimitSegment(
          '192.0.2.11'
        )}`,
        limit: 60,
        windowSeconds: 60
      })
    );
  });

  it('uses 5/60s for disconnect and client reset', async () => {
    const consume = vi.spyOn(rateLimitCache, 'consume');
    await assertMcpOAuthDisconnectByAppRateLimit({ appId: 'app-3' });
    await assertMcpOAuthClientResetByAppRateLimit({ appId: 'app-4' });

    expect(consume).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'rate-limit:mcp-oauth:disconnect-app:app:app-3',
        limit: 5,
        windowSeconds: 60
      })
    );
    expect(consume).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'rate-limit:mcp-oauth:client-reset-app:app:app-4',
        limit: 5,
        windowSeconds: 60
      })
    );
  });

  it('fails closed for start/disconnect but open for callback/metadata when Redis is down', async () => {
    vi.spyOn(rateLimitCache, 'consume').mockRejectedValueOnce(new Error('redis down'));
    await expect(assertMcpOAuthStartByAppRateLimit({ appId: 'app-5' })).rejects.toBe(
      ERROR_ENUM.tooManyRequest
    );

    vi.spyOn(rateLimitCache, 'consume').mockRejectedValueOnce(new Error('redis down'));
    await expect(assertMcpOAuthDisconnectByAppRateLimit({ appId: 'app-6' })).rejects.toBe(
      ERROR_ENUM.tooManyRequest
    );

    vi.spyOn(rateLimitCache, 'consume').mockRejectedValueOnce(new Error('redis down'));
    await expect(
      assertMcpOAuthCallbackByIpRateLimit({ ip: '192.0.2.12' })
    ).resolves.toBeUndefined();

    vi.spyOn(rateLimitCache, 'consume').mockRejectedValueOnce(new Error('redis down'));
    await expect(
      assertMcpOAuthClientMetadataByIpRateLimit({ ip: '192.0.2.13' })
    ).resolves.toBeUndefined();
  });
});
