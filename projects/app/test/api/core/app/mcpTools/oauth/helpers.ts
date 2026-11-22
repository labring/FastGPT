import { Types } from '@fastgpt/service/common/mongo';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { encryptSecretValue } from '@fastgpt/service/common/secret/utils';

export type ToolsetFixtureOptions = {
  url?: string;
  authMode?: 'headers' | 'oauth';
  oauth?: Record<string, unknown>;
  nodeId?: string;
  duplicateNodes?: boolean;
  appType?: string;
};

/**
 * 插入真实的 Mongo app + 版本文档，供路由与服务层共用。
 * 版本文档直接走 collection.insertOne，避免测试依赖上游 schema 默认值。
 */
export const createToolsetFixture = async ({
  url = 'https://example.org/mcp',
  authMode = 'oauth',
  oauth,
  nodeId = 'node-1',
  duplicateNodes = false,
  appType = AppTypeEnum.mcpToolSet
}: ToolsetFixtureOptions = {}) => {
  const appId = new Types.ObjectId();
  const versionId = new Types.ObjectId();
  const teamId = new Types.ObjectId();
  const tmbId = new Types.ObjectId();

  await MongoApp.collection.insertOne({
    _id: appId,
    name: 'oauth-toolset',
    type: appType,
    teamId,
    tmbId,
    publishedVersionId: versionId
  });

  const node = (id: string) => ({
    nodeId: id,
    flowNodeType: 'toolSet',
    name: 'toolset',
    toolConfig: {
      mcpToolSet: {
        url,
        authMode,
        ...(authMode === 'oauth'
          ? { oauth: oauth ?? { schemaVersion: 1, clientMode: 'auto', credentialSeq: 0 } }
          : {})
      }
    }
  });

  await MongoAppVersion.collection.insertOne({
    _id: versionId,
    appId,
    time: new Date(),
    isPublished: true,
    isPublish: true,
    nodes: duplicateNodes ? [node('n1'), node('n2')] : [node(nodeId)]
  });

  return {
    appId: appId.toString(),
    versionId,
    teamId: teamId.toString(),
    tmbId: tmbId.toString(),
    nodeId: duplicateNodes ? 'n1' : nodeId,
    app: { _id: appId, type: appType, teamId }
  };
};

export const readToolsetOAuth = async (versionId: Types.ObjectId) => {
  const stored = await MongoAppVersion.collection.findOne({ _id: versionId });
  return stored?.nodes[0].toolConfig.mcpToolSet.oauth;
};

export const buildOAuthConfig = ({
  credentialSeq = 0,
  clientId = 'client-1',
  includeToken = false,
  includeServer = true,
  revocationEndpoint,
  registrationClientUri,
  registrationAccessToken
}: {
  credentialSeq?: number;
  clientId?: string;
  includeToken?: boolean;
  includeServer?: boolean;
  revocationEndpoint?: string;
  registrationClientUri?: string;
  registrationAccessToken?: string;
} = {}) => ({
  schemaVersion: 1,
  clientMode: 'manual',
  credentialSeq,
  clientSource: 'dcr',
  issuer: 'https://example.org/',
  resource: 'https://example.org/mcp',
  client: {
    clientId,
    tokenEndpointAuthMethod: 'none',
    ...(registrationClientUri
      ? {
          registrationClientUri,
          ...(registrationAccessToken
            ? { registrationAccessToken: encryptSecretValue({ value: registrationAccessToken }) }
            : {})
        }
      : {})
  },
  ...(includeServer
    ? {
        server: {
          issuer: 'https://example.org/',
          authorizationEndpoint: 'https://example.org/authorize',
          tokenEndpoint: 'https://example.org/token',
          ...(revocationEndpoint ? { revocationEndpoint } : {}),
          source: 'discovered',
          fetchedAt: 0
        }
      }
    : {}),
  ...(includeToken
    ? {
        token: {
          secret: {
            access_token: encryptSecretValue({ value: 'access-token-value' }),
            refresh_token: encryptSecretValue({ value: 'refresh-token-value' })
          },
          expiresAt: 0,
          obtainedAt: 0,
          scope: 'read'
        },
        authorizedAt: 1,
        authorizedBy: 'tmb'
      }
    : {})
});

type RouteHandler = (req: any, res: any) => Promise<unknown> | unknown;

/**
 * 轻量 Next API 调用器：身份包装在测试中被 mock 成恒等函数，
 * 因此这里只需要提供 handler 实际使用的 req/res 字段。
 */
export const callRoute = async (
  handler: RouteHandler,
  {
    method = 'GET',
    query = {},
    body = {},
    headers = {}
  }: {
    method?: string;
    query?: Record<string, unknown>;
    body?: Record<string, unknown>;
    headers?: Record<string, string>;
  } = {}
) => {
  const responseHeaders: Record<string, string> = {};
  let statusCode = 200;
  let jsonBody: any;
  let ended = false;

  const res: any = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    setHeader(key: string, value: string) {
      responseHeaders[key.toLowerCase()] = value;
      return res;
    },
    json(value: unknown) {
      jsonBody = value;
      ended = true;
      return value;
    },
    end() {
      ended = true;
      return res;
    },
    get writableEnded() {
      return ended;
    },
    get headersSent() {
      return ended;
    }
  };

  const returned = await handler(
    { method, query, body, headers, cookies: {} },
    res
  );

  return {
    status: statusCode,
    body: jsonBody,
    headers: responseHeaders,
    raw: returned
  };
};

export const jsonResponse = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers }
  });
