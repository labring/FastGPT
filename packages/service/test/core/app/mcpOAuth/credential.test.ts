import { afterEach, describe, expect, it } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import {
  deriveMcpOAuthStatus,
  getMcpToolSetVersionDoc,
  mergeMcpOAuthFromPublished,
  resolveMcpOAuthNode,
  updateMcpOAuthNodeFields
} from '@fastgpt/service/core/app/mcpOAuth';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { encryptSecretValue } from '@fastgpt/service/common/secret/utils';
import {
  McpOAuthErrorCodeEnum,
  McpOAuthStatusEnum
} from '@fastgpt/global/core/app/tool/mcpTool/oauth';
import { McpOAuthApiError } from '@fastgpt/service/core/app/mcpOAuth/errors';

const appIds: Types.ObjectId[] = [];

const createFixture = async ({
  nodes,
  published = true
}: {
  nodes?: any[];
  published?: boolean;
}) => {
  const appId = new Types.ObjectId();
  const versionId = new Types.ObjectId();
  appIds.push(appId);

  await MongoApp.collection.insertOne({
    _id: appId,
    type: 'toolSet',
    teamId: new Types.ObjectId(),
    ...(published ? { publishedVersionId: versionId } : {})
  });

  await MongoAppVersion.collection.insertOne({
    _id: versionId,
    appId,
    time: new Date(),
    isPublish: true,
    nodes: nodes ?? [
      {
        nodeId: 'node-1',
        flowNodeType: 'toolSet',
        toolConfig: {
          mcpToolSet: {
            url: 'https://example.org/mcp',
            authMode: 'oauth',
            oauth: { schemaVersion: 1, clientMode: 'auto', credentialSeq: 0 }
          }
        }
      }
    ]
  });

  return { appId: appId.toString(), versionId, nodeId: 'node-1' };
};

const readVersion = async (versionId: Types.ObjectId) =>
  MongoAppVersion.collection.findOne({ _id: versionId });

describe('mcpOAuth credential', () => {
  afterEach(async () => {
    await MongoAppVersion.deleteMany({});
    await MongoApp.deleteMany({ _id: { $in: appIds } });
    appIds.length = 0;
  });

  it('resolves the published version and writes oauth fields with nodesRevision', async () => {
    const { appId, versionId } = await createFixture({});

    const version = await getMcpToolSetVersionDoc(appId);
    expect(version._id.toString()).toBe(versionId.toString());

    const result = await updateMcpOAuthNodeFields({
      appId,
      nodeId: 'node-1',
      expectedCredentialSeq: 0,
      set: { client: { clientId: 'client-1', tokenEndpointAuthMethod: 'none' } }
    });
    expect(result.matched).toBe(true);

    const stored = await readVersion(versionId);
    expect(stored?.nodes[0].toolConfig.mcpToolSet.oauth.client.clientId).toBe('client-1');
    expect(stored?.nodesRevision).toBe(1);
  });

  it('increments credentialSeq with CAS and rejects stale writers', async () => {
    const { appId, versionId } = await createFixture({});

    expect(
      (
        await updateMcpOAuthNodeFields({
          appId,
          nodeId: 'node-1',
          expectedCredentialSeq: 0,
          set: { issuer: 'https://as.example.org/' },
          incrementSeq: true
        })
      ).matched
    ).toBe(true);

    let stored = await readVersion(versionId);
    expect(stored?.nodes[0].toolConfig.mcpToolSet.oauth.credentialSeq).toBe(1);

    const stale = await updateMcpOAuthNodeFields({
      appId,
      nodeId: 'node-1',
      expectedCredentialSeq: 0,
      set: { issuer: 'https://stale.example.org/' }
    });
    expect(stale.matched).toBe(false);

    stored = await readVersion(versionId);
    expect(stored?.nodes[0].toolConfig.mcpToolSet.oauth.issuer).toBe('https://as.example.org/');
  });

  it('accepts a missing credentialSeq as 0 without a data fixup', async () => {
    const { appId, versionId } = await createFixture({
      nodes: [
        {
          nodeId: 'node-1',
          flowNodeType: 'toolSet',
          toolConfig: {
            mcpToolSet: { url: 'https://example.org/mcp', authMode: 'oauth', oauth: {} }
          }
        }
      ]
    });

    const result = await updateMcpOAuthNodeFields({
      appId,
      nodeId: 'node-1',
      expectedCredentialSeq: 0,
      set: { issuer: 'https://as.example.org/' },
      incrementSeq: true
    });
    expect(result.matched).toBe(true);

    const stored = await readVersion(versionId);
    expect(stored?.nodes[0].toolConfig.mcpToolSet.oauth.credentialSeq).toBe(1);
  });

  it('rejects ambiguous toolset nodes without nodeId', async () => {
    const duplicate = (nodeId: string) => ({
      nodeId,
      flowNodeType: 'toolSet',
      toolConfig: {
        mcpToolSet: {
          url: 'https://example.org/mcp',
          authMode: 'oauth',
          oauth: { schemaVersion: 1 }
        }
      }
    });
    const { appId } = await createFixture({ nodes: [duplicate('n1'), duplicate('n2')] });

    const version = await getMcpToolSetVersionDoc(appId);
    let error: McpOAuthApiError | undefined;
    try {
      resolveMcpOAuthNode(version);
    } catch (caught) {
      error = caught as McpOAuthApiError;
    }
    expect(error?.oauthCode).toBe(McpOAuthErrorCodeEnum.nodeAmbiguous);
    expect(resolveMcpOAuthNode(version, 'n2').nodeId).toBe('n2');
  });

  it('derives the 8-state projection with the documented priority', () => {
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
        access_token: encryptSecretValue({ value: 'access' }),
        refresh_token: encryptSecretValue({ value: 'refresh' })
      },
      expiresAt: 2_000_000,
      obtainedAt: 0
    };

    expect(deriveMcpOAuthStatus({ authMode: 'headers', toolSet: {}, oauth: undefined }).state).toBe(
      McpOAuthStatusEnum.headers
    );

    expect(
      deriveMcpOAuthStatus({
        authMode: 'oauth',
        toolSet: { url: 'https://example.org/mcp' },
        oauth: undefined
      }).state
    ).toBe(McpOAuthStatusEnum.configError);

    expect(
      deriveMcpOAuthStatus({
        authMode: 'oauth',
        toolSet: { url: 'https://example.org/mcp' },
        oauth: { ...baseOAuth, token },
        hasPendingState: true,
        now: 1_000_000
      }).state
    ).toBe(McpOAuthStatusEnum.pendingAuthorization);

    expect(
      deriveMcpOAuthStatus({
        authMode: 'oauth',
        toolSet: { url: 'https://example.org/mcp' },
        oauth: { ...baseOAuth, token },
        now: 1_000_000
      })
    ).toMatchObject({ state: McpOAuthStatusEnum.authorized, authorized: true });

    expect(
      deriveMcpOAuthStatus({
        authMode: 'oauth',
        toolSet: { url: 'https://example.org/mcp' },
        oauth: { ...baseOAuth, token: { ...token, expiresAt: 1_010_000 } },
        now: 1_000_000
      }).state
    ).toBe(McpOAuthStatusEnum.refreshDue);

    expect(
      deriveMcpOAuthStatus({
        authMode: 'oauth',
        toolSet: { url: 'https://example.org/mcp' },
        oauth: { ...baseOAuth, refreshLease: { owner: 'x', expiresAt: 1_010_000 } },
        now: 1_000_000
      }).state
    ).toBe(McpOAuthStatusEnum.refreshing);

    expect(
      deriveMcpOAuthStatus({
        authMode: 'oauth',
        toolSet: { url: 'https://example.org/mcp' },
        oauth: baseOAuth,
        now: 1_000_000
      }).state
    ).toBe(McpOAuthStatusEnum.reauthRequired);

    // client 缺失与非可重试错误优先于 token 可用性，否则这两个状态永远不会出现。
    expect(
      deriveMcpOAuthStatus({
        authMode: 'oauth',
        toolSet: { url: 'https://example.org/mcp' },
        oauth: { ...baseOAuth, client: undefined, token },
        now: 1_000_000
      }).state
    ).toBe(McpOAuthStatusEnum.clientMissing);

    expect(
      deriveMcpOAuthStatus({
        authMode: 'oauth',
        toolSet: { url: 'https://example.org/mcp' },
        oauth: {
          ...baseOAuth,
          token,
          lastError: {
            code: McpOAuthErrorCodeEnum.reauthRequired,
            at: 0,
            retryable: false
          }
        },
        now: 1_000_000
      }).state
    ).toBe(McpOAuthStatusEnum.reauthRequired);
  });

  it('merges oauth config on save without treating headers as oauth', () => {
    expect(
      mergeMcpOAuthFromPublished({
        previousAuthMode: 'headers',
        nextAuthMode: 'oauth',
        urlChanged: false,
        nextClientMode: 'auto',
        nextScope: 'read'
      })
    ).toMatchObject({
      oauth: { schemaVersion: 1, clientMode: 'auto', scope: 'read', credentialSeq: 0 },
      credentialSeqDelta: 0
    });

    const merged = mergeMcpOAuthFromPublished({
      previousAuthMode: 'oauth',
      nextAuthMode: 'oauth',
      urlChanged: true,
      existingOAuth: {
        schemaVersion: 1,
        clientMode: 'auto',
        credentialSeq: 3,
        client: { clientId: 'client-1', tokenEndpointAuthMethod: 'none' },
        clientSource: 'dcr',
        token: {
          secret: { access_token: encryptSecretValue({ value: 'a' }) },
          expiresAt: 0,
          obtainedAt: 0
        }
      }
    });
    expect(merged.credentialSeqDelta).toBe(1);
    expect(merged.oauth?.token).toBeUndefined();
    // URL 变更但未重新发现 issuer：旧 client 可能绑定在旧 issuer 上，不能复用；
    // 也不得把旧 issuer 写回，等下一次 start 重新发现。
    expect(merged.oauth?.client).toBeUndefined();
    expect(merged.oauth?.issuer).toBeUndefined();
    // client 被丢弃时来源必须一起清空，不能留下“clientSource 已声明但 client 为空”。
    expect(merged.oauth?.clientSource).toBeUndefined();

    // URL 变更 + 重新发现到新 issuer：写回 nextIssuer、丢弃旧 client 与已失效 resource。
    const mergedWithIssuer = mergeMcpOAuthFromPublished({
      previousAuthMode: 'oauth',
      nextAuthMode: 'oauth',
      urlChanged: true,
      nextIssuer: 'https://as2.example.org/',
      existingOAuth: {
        schemaVersion: 1,
        clientMode: 'auto',
        credentialSeq: 3,
        issuer: 'https://as1.example.org/',
        resource: 'https://old.example.org/mcp',
        client: { clientId: 'client-1', tokenEndpointAuthMethod: 'none' },
        clientSource: 'manual'
      }
    });
    expect(mergedWithIssuer.oauth?.issuer).toBe('https://as2.example.org/');
    expect(mergedWithIssuer.oauth?.resource).toBeUndefined();
    expect(mergedWithIssuer.oauth?.client).toBeUndefined();
    expect(mergedWithIssuer.oauth?.clientSource).toBeUndefined();

    // URL 变更但 issuer 未变：client 仍属于同一 AS，client 与 clientSource 都要保留。
    const mergedSameIssuer = mergeMcpOAuthFromPublished({
      previousAuthMode: 'oauth',
      nextAuthMode: 'oauth',
      urlChanged: true,
      nextIssuer: 'https://as1.example.org/',
      existingOAuth: {
        schemaVersion: 1,
        clientMode: 'auto',
        credentialSeq: 3,
        issuer: 'https://as1.example.org/',
        client: { clientId: 'client-1', tokenEndpointAuthMethod: 'none' },
        clientSource: 'cimd'
      }
    });
    expect(mergedSameIssuer.oauth?.client?.clientId).toBe('client-1');
    expect(mergedSameIssuer.oauth?.clientSource).toBe('cimd');

    // 历史 null（Stage K10）：未变更认证模式时读入后写回必须剔除 clientSource，
    // 不能把 null 继续持久化（schema 只允许 cimd|dcr|manual）。
    const mergedNullSource = mergeMcpOAuthFromPublished({
      previousAuthMode: 'oauth',
      nextAuthMode: 'oauth',
      urlChanged: false,
      existingOAuth: {
        schemaVersion: 1,
        clientMode: 'manual',
        credentialSeq: 4,
        clientSource: null,
        resource: 'https://mcp.example.org/mcp',
        authorizedAt: 1,
        authorizedBy: 'tmb'
      }
    });
    expect(mergedNullSource.oauth).not.toHaveProperty('clientSource');
    expect(mergedNullSource.oauth?.resource).toBe('https://mcp.example.org/mcp');
    expect(mergedNullSource.credentialSeqDelta).toBe(0);

    const toHeaders = mergeMcpOAuthFromPublished({
      previousAuthMode: 'oauth',
      nextAuthMode: 'headers',
      urlChanged: false,
      existingOAuth: {
        schemaVersion: 1,
        clientMode: 'auto',
        credentialSeq: 3,
        client: {
          clientId: 'client-1',
          tokenEndpointAuthMethod: 'client_secret_post',
          clientSecret: encryptSecretValue({ value: 'secret' })
        }
      }
    });
    expect(toHeaders.credentialSeqDelta).toBe(1);
    expect(toHeaders.oauth?.client?.clientSecret).toBeUndefined();
    expect(toHeaders.oauth?.client?.clientId).toBe('client-1');
  });
});
