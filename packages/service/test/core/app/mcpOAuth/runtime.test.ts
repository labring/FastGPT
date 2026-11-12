import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import {
  ensureMcpOAuthAccessToken,
  resetMcpOAuthFetchImpl,
  resolveMcpToolSetHeaders,
  setMcpOAuthFetchImpl,
  withMcpOAuthRetry
} from '@fastgpt/service/core/app/mcpOAuth';
import { McpOAuthApiError } from '@fastgpt/service/core/app/mcpOAuth/errors';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { encryptSecretValue } from '@fastgpt/service/common/secret/utils';
import { McpOAuthErrorCodeEnum } from '@fastgpt/global/core/app/tool/mcpTool/oauth';

const appIds: Types.ObjectId[] = [];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });

const createFixture = async ({
  token,
  withRefreshToken = true
}: {
  token?: Record<string, unknown>;
  withRefreshToken?: boolean;
}) => {
  const appId = new Types.ObjectId();
  const versionId = new Types.ObjectId();
  appIds.push(appId);

  await MongoApp.collection.insertOne({
    _id: appId,
    type: 'toolSet',
    teamId: new Types.ObjectId(),
    publishedVersionId: versionId
  });

  const secret: Record<string, unknown> = {
    access_token: encryptSecretValue({ value: 'old-access' })
  };
  if (withRefreshToken) {
    secret.refresh_token = encryptSecretValue({ value: 'old-refresh' });
  }
  const storedToken = token
    ? {
        ...token,
        secret: {
          ...(token.secret as Record<string, unknown>),
          ...(withRefreshToken && !(token.secret as Record<string, unknown>)?.refresh_token
            ? { refresh_token: encryptSecretValue({ value: 'old-refresh' }) }
            : {})
        }
      }
    : {
        secret,
        expiresAt: 1_000,
        obtainedAt: 0
      };

  await MongoAppVersion.collection.insertOne({
    _id: versionId,
    appId,
    time: new Date(),
    isPublish: true,
    nodes: [
      {
        nodeId: 'node-1',
        flowNodeType: 'toolSet',
        toolConfig: {
          mcpToolSet: {
            url: 'https://example.org/mcp',
            authMode: 'oauth',
            oauth: {
              schemaVersion: 1,
              clientMode: 'auto',
              credentialSeq: 0,
              issuer: 'https://as.example.org/',
              resource: 'https://example.org/mcp',
              client: { clientId: 'client-1', tokenEndpointAuthMethod: 'none' },
              server: {
                issuer: 'https://as.example.org/',
                authorizationEndpoint: 'https://as.example.org/authorize',
                tokenEndpoint: 'https://as.example.org/token',
                source: 'discovered',
                fetchedAt: 0
              },
              token: storedToken
            }
          }
        }
      }
    ]
  });

  return { appId: appId.toString(), versionId };
};

const readOAuth = async (versionId: Types.ObjectId) => {
  const stored = await MongoAppVersion.collection.findOne({ _id: versionId });
  return stored?.nodes[0].toolConfig.mcpToolSet.oauth;
};

const asOAuthError = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error as McpOAuthApiError;
  }
  throw new Error('Expected promise to reject');
};

const httpError = (status: number, message = 'request failed') =>
  Object.assign(new Error(message), { status });

describe('mcpOAuth runtime', () => {
  afterEach(async () => {
    resetMcpOAuthFetchImpl();
    await MongoAppVersion.deleteMany({});
    await MongoApp.deleteMany({ _id: { $in: appIds } });
    appIds.length = 0;
  });

  it('refreshes a lazy-expired token and persists it with seq CAS', async () => {
    const { appId, versionId } = await createFixture({});

    let refreshCalls = 0;
    setMcpOAuthFetchImpl(async (_url, init) => {
      refreshCalls += 1;
      const body = new URLSearchParams(String(init?.body));
      expect(body.get('grant_type')).toBe('refresh_token');
      expect(body.get('refresh_token')).toBe('old-refresh');
      return json({ access_token: 'new-access', token_type: 'Bearer', expires_in: 3600 });
    });

    const access = await ensureMcpOAuthAccessToken({ appId, nodeId: 'node-1' });
    expect(access).toBe('new-access');
    expect(refreshCalls).toBe(1);

    const oauth = await readOAuth(versionId);
    expect(oauth?.credentialSeq).toBe(1);
    expect(oauth?.lastError).toBeNull();
    expect(oauth?.authorizedAt).toBeTruthy();
    expect(JSON.stringify(oauth?.token)).not.toContain('new-access');
  });

  it('returns the stored token without refreshing while it is usable', async () => {
    const { appId } = await createFixture({
      token: {
        secret: { access_token: encryptSecretValue({ value: 'still-valid' }) },
        expiresAt: 0,
        obtainedAt: 0
      }
    });

    let fetchCalls = 0;
    setMcpOAuthFetchImpl(async () => {
      fetchCalls += 1;
      return json({}, 500);
    });

    await expect(ensureMcpOAuthAccessToken({ appId, nodeId: 'node-1' })).resolves.toBe(
      'still-valid'
    );
    expect(fetchCalls).toBe(0);
  });

  it('forces a refresh when forceRefresh is set', async () => {
    const { appId } = await createFixture({
      token: {
        secret: { access_token: encryptSecretValue({ value: 'old' }) },
        expiresAt: 0,
        obtainedAt: 0
      }
    });
    let refreshCalls = 0;
    setMcpOAuthFetchImpl(async () => {
      refreshCalls += 1;
      return json({ access_token: 'forced', token_type: 'Bearer', expires_in: 60 });
    });

    await expect(
      ensureMcpOAuthAccessToken({ appId, nodeId: 'node-1', forceRefresh: true })
    ).resolves.toBe('forced');
    expect(refreshCalls).toBe(1);
  });

  it('maps invalid_grant to reauth_required and clears the token', async () => {
    const { appId, versionId } = await createFixture({});
    setMcpOAuthFetchImpl(async () => json({ error: 'invalid_grant' }, 400));

    const error = await asOAuthError(ensureMcpOAuthAccessToken({ appId, nodeId: 'node-1' }));
    expect(error.oauthCode).toBe(McpOAuthErrorCodeEnum.reauthRequired);

    const oauth = await readOAuth(versionId);
    expect(oauth?.token).toBeUndefined();
    expect(oauth?.credentialSeq).toBe(1);
  });

  it('does not refresh when refresh is disabled', async () => {
    const { appId } = await createFixture({});
    let fetchCalls = 0;
    setMcpOAuthFetchImpl(async () => {
      fetchCalls += 1;
      return json({}, 500);
    });

    const error = await asOAuthError(
      ensureMcpOAuthAccessToken({ appId, nodeId: 'node-1', allowRefresh: false })
    );
    expect(error.oauthCode).toBe(McpOAuthErrorCodeEnum.reauthRequired);
    expect(fetchCalls).toBe(0);
  });

  it('retries exactly once on 401 with a forced refresh', async () => {
    const { appId } = await createFixture({
      token: {
        secret: { access_token: encryptSecretValue({ value: 'stale' }) },
        expiresAt: 0,
        obtainedAt: 0
      }
    });
    let refreshCalls = 0;
    setMcpOAuthFetchImpl(async () => {
      refreshCalls += 1;
      return json({ access_token: 'fresh', token_type: 'Bearer', expires_in: 600 });
    });

    const seen: string[] = [];
    const result = await withMcpOAuthRetry({
      appId,
      nodeId: 'node-1',
      run: async (headers) => {
        seen.push(headers.Authorization);
        if (seen.length === 1) throw httpError(401);
        return 'ok';
      }
    });

    expect(result).toBe('ok');
    expect(seen).toEqual(['Bearer stale', 'Bearer fresh']);
    expect(refreshCalls).toBe(1);
  });

  it('gives up after a second 401 without looping', async () => {
    const { appId } = await createFixture({});
    setMcpOAuthFetchImpl(async () => json({ access_token: 'a', token_type: 'Bearer', expires_in: 600 }));

    let runs = 0;
    const error = await asOAuthError(
      withMcpOAuthRetry({
        appId,
        nodeId: 'node-1',
        run: async () => {
          runs += 1;
          throw httpError(401);
        }
      })
    );
    expect(runs).toBe(2);
    expect(error.oauthCode).toBe(McpOAuthErrorCodeEnum.reauthRequired);
  });

  it('does not refresh on insufficient_scope', async () => {
    const { appId } = await createFixture({
      token: {
        secret: { access_token: encryptSecretValue({ value: 'scoped' }) },
        expiresAt: 0,
        obtainedAt: 0
      }
    });
    let fetchCalls = 0;
    setMcpOAuthFetchImpl(async () => {
      fetchCalls += 1;
      return json({ access_token: 'x', token_type: 'Bearer' });
    });

    let runs = 0;
    const error = await asOAuthError(
      withMcpOAuthRetry({
        appId,
        nodeId: 'node-1',
        run: async () => {
          runs += 1;
          throw httpError(403, 'insufficient_scope');
        }
      })
    );
    expect(error.oauthCode).toBe(McpOAuthErrorCodeEnum.insufficientScope);
    expect(runs).toBe(1);
    expect(fetchCalls).toBe(0);
  });

  it('waits longer than 1.5s for a concurrent refresh to publish its token', async () => {
    const { appId, versionId } = await createFixture({});
    // 另一个实例持有未过期租约：本实例必须等待其写回，而不是重复刷新。
    await MongoAppVersion.collection.updateOne(
      { _id: versionId },
      {
        $set: {
          'nodes.0.toolConfig.mcpToolSet.oauth.refreshLease': {
            owner: 'other-instance',
            expiresAt: Date.now() + 60_000
          }
        }
      }
    );

    let fetchCalls = 0;
    setMcpOAuthFetchImpl(async () => {
      fetchCalls += 1;
      return json({}, 500);
    });

    const winner = new Promise<void>((resolve, reject) => {
      setTimeout(() => {
        MongoAppVersion.collection
          .updateOne(
            { _id: versionId },
            {
              $set: {
                'nodes.0.toolConfig.mcpToolSet.oauth.token': {
                  secret: { access_token: encryptSecretValue({ value: 'winner-access' }) },
                  expiresAt: Date.now() + 60_000,
                  obtainedAt: Date.now()
                },
                'nodes.0.toolConfig.mcpToolSet.oauth.credentialSeq': 1,
                'nodes.0.toolConfig.mcpToolSet.oauth.refreshLease': null
              }
            }
          )
          .then(() => resolve(), reject);
      }, 1_600);
    });

    const startedAt = Date.now();
    const access = await ensureMcpOAuthAccessToken({ appId, nodeId: 'node-1' });
    const elapsed = Date.now() - startedAt;
    await winner;

    expect(access).toBe('winner-access');
    expect(elapsed).toBeGreaterThan(1_500);
    expect(fetchCalls).toBe(0);
  });

  it('degrades an undecryptable refresh token to reauth_required', async () => {
    const { appId } = await createFixture({
      token: {
        secret: {
          access_token: { secret: `${'00'.repeat(16)}:${'00'.repeat(8)}:${'00'.repeat(16)}` },
          refresh_token: { secret: `${'11'.repeat(16)}:${'11'.repeat(8)}:${'11'.repeat(16)}` }
        },
        expiresAt: 0,
        obtainedAt: 0
      }
    });

    let fetchCalls = 0;
    setMcpOAuthFetchImpl(async () => {
      fetchCalls += 1;
      return json({ access_token: 'x', token_type: 'Bearer', expires_in: 60 });
    });

    const error = await asOAuthError(ensureMcpOAuthAccessToken({ appId, nodeId: 'node-1' }));
    expect(error.oauthCode).toBe(McpOAuthErrorCodeEnum.reauthRequired);
    expect(fetchCalls).toBe(0);
  });

  it('keeps headers mode untouched (no Bearer injection)', async () => {
    await expect(
      resolveMcpToolSetHeaders({
        appId: new Types.ObjectId().toString(),
        nodeId: 'node-1',
        toolSet: {
          authMode: 'headers',
          headerSecret: { Authorization: encryptSecretValue({ value: 'plain-header' }) }
        }
      })
    ).resolves.toMatchObject({ Authorization: 'plain-header' });
  });
});
