import { createHash, randomBytes } from 'node:crypto';
import { isValidMcpOAuthScope } from '@fastgpt/global/core/app/tool/mcpTool/oauth';
import type {
  McpOAuthClientType,
  McpOAuthServerMetadataType
} from '@fastgpt/global/core/app/tool/mcpTool/oauthConfig';
import type {
  McpOAuthClientMode,
  McpOAuthClientSource
} from '@fastgpt/global/core/app/tool/mcpTool/oauth';
import type { McpOAuthManualClientType } from '@fastgpt/global/openapi/core/app/mcpTools/oauth';
import { encryptSecretValue, decryptSecretValue } from '../../../common/secret/utils';
import { McpOAuthApiError } from './errors';
import { McpOAuthErrorCodeEnum } from '@fastgpt/global/core/app/tool/mcpTool/oauth';
import { assertMcpOAuthUrlSafe, requestMcpOAuthHttp } from './httpRuntime';

/**
 * 客户端注册（v2.4 §5.4 / §5.5）。
 *
 * 模式顺序固定：CIMD → DCR → manual；显式模式不静默降级。
 * CIMD 的 `client_id` 是本站公开元数据 URL；DCR 使用 RFC 7591，
 * 注销使用 RFC 7592。
 */

export const MCP_OAUTH_CIMD_CLIENT_NAME = 'FastGPT';

export const buildMcpOAuthCimdDocument = ({
  clientId,
  redirectUri
}: {
  clientId: string;
  redirectUri: string;
}) => ({
  client_id: clientId,
  client_name: MCP_OAUTH_CIMD_CLIENT_NAME,
  redirect_uris: [redirectUri],
  grant_types: ['authorization_code', 'refresh_token'],
  response_types: ['code'],
  token_endpoint_auth_method: 'none' as const,
  code_challenge_method: 'S256' as const
});

export type McpOAuthCimdDocument = ReturnType<typeof buildMcpOAuthCimdDocument>;

/** ETag 基于稳定序列化；文档由服务端常量构造，键顺序固定。 */
export const getMcpOAuthCimdEtag = (document: McpOAuthCimdDocument) =>
  `"${createHash('sha256').update(JSON.stringify(document)).digest('hex')}"`;

export const isMcpOAuthCimdEtagMatched = (
  ifNoneMatch: string | undefined,
  etag: string
): boolean => {
  if (!ifNoneMatch) return false;
  return ifNoneMatch
    .split(',')
    .map((value) => value.trim().replace(/^W\//, ''))
    .some((value) => value === '*' || value === etag);
};

export const isMcpOAuthCimdHostAllowed = (host: string | undefined, feDomain: string) => {
  if (!host) return false;
  try {
    return host.toLowerCase() === new URL(feDomain).host.toLowerCase();
  } catch {
    return false;
  }
};

/**
 * CIMD 前置条件：AS 明确声明支持，且本站 `FE_DOMAIN` 是 https 公网可达地址。
 */
export const isMcpOAuthCimdAvailable = async ({
  server,
  feDomain
}: {
  server: Pick<McpOAuthServerMetadataType, 'clientIdMetadataDocumentSupported'>;
  feDomain: string;
}): Promise<boolean> => {
  if (server.clientIdMetadataDocumentSupported !== true) return false;
  if (!feDomain.startsWith('https://')) return false;
  try {
    await assertMcpOAuthUrlSafe(feDomain, { allowInsecureHttp: false });
    return true;
  } catch {
    return false;
  }
};

export const assertMcpOAuthPkceSupported = (
  server: Pick<McpOAuthServerMetadataType, 'codeChallengeMethodsSupported'>
) => {
  const methods = server.codeChallengeMethodsSupported;
  if (methods && !methods.map((method) => method.toUpperCase()).includes('S256')) {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.pkceUnsupported, {
      message: 'Authorization server does not support PKCE S256'
    });
  }
};

/** scope 原样使用；空字符串视为未请求。 */
export const normalizeMcpOAuthRequestedScope = (scope?: string): string | undefined => {
  if (!scope) return undefined;
  if (!isValidMcpOAuthScope(scope)) {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.scopeInvalid, {
      message: 'Requested scope is invalid'
    });
  }
  return scope;
};

export const createMcpOAuthPkce = () => {
  const codeVerifier = randomBytes(32).toString('base64url');
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge, codeChallengeMethod: 'S256' as const };
};

export const buildMcpOAuthAuthorizationUrl = ({
  authorizationEndpoint,
  clientId,
  redirectUri,
  scope,
  state,
  codeChallenge,
  resource
}: {
  authorizationEndpoint: string;
  clientId: string;
  redirectUri: string;
  scope?: string;
  state: string;
  codeChallenge: string;
  resource: string;
}) => {
  const url = new URL(authorizationEndpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  if (scope) url.searchParams.set('scope', scope);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('resource', resource);
  return url.toString();
};

const MCP_OAUTH_CLIENT_AUTH_METHODS = new Set<McpOAuthClientType['tokenEndpointAuthMethod']>([
  'none',
  'client_secret_post',
  'client_secret_basic'
]);

/**
 * DCR 认证方式：优先 none，其次 client_secret_post / client_secret_basic；
 * AS 未声明时按 client_secret_basic 兼容（与设计 §5.4 的默认一致）。
 */
export const pickMcpOAuthDcrAuthMethod = (
  supported: string[] | undefined
): McpOAuthClientType['tokenEndpointAuthMethod'] => {
  if (!supported || supported.length === 0) return 'client_secret_basic';
  if (supported.includes('none')) return 'none';
  if (supported.includes('client_secret_post')) return 'client_secret_post';
  if (supported.includes('client_secret_basic')) return 'client_secret_basic';
  throw new McpOAuthApiError(McpOAuthErrorCodeEnum.registrationUnsupported, {
    message: 'No supported token endpoint auth method'
  });
};

const buildManualClient = (manual: McpOAuthManualClientType): McpOAuthClientType => {
  if (manual.tokenEndpointAuthMethod !== 'none' && !manual.clientSecret) {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.clientRequired, {
      message: 'Manual client secret is required'
    });
  }
  return {
    clientId: manual.clientId,
    tokenEndpointAuthMethod: manual.tokenEndpointAuthMethod,
    ...(manual.clientSecret
      ? { clientSecret: encryptSecretValue({ value: manual.clientSecret }) }
      : {})
  };
};

type DcrResponse = {
  client_id?: unknown;
  client_secret?: unknown;
  token_endpoint_auth_method?: unknown;
  registration_client_uri?: unknown;
  registration_access_token?: unknown;
};

const registerMcpOAuthClientDcr = async ({
  server,
  redirectUri,
  now
}: {
  server: McpOAuthServerMetadataType;
  redirectUri: string;
  now: number;
}): Promise<McpOAuthClientType> => {
  if (!server.registrationEndpoint) {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.registrationUnsupported, {
      message: 'Authorization server does not support dynamic registration'
    });
  }

  const authMethod = pickMcpOAuthDcrAuthMethod(server.tokenEndpointAuthMethodsSupported);
  const response = await requestMcpOAuthHttp({
    url: server.registrationEndpoint,
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json'
    },
    body: JSON.stringify({
      client_name: MCP_OAUTH_CIMD_CLIENT_NAME,
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: authMethod,
      code_challenge_method: 'S256'
    }),
    networkErrorCode: McpOAuthErrorCodeEnum.registrationFailed
  });

  if (response.status >= 300 && response.status < 400) {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.registrationFailed, {
      message: 'Registration endpoint returned a redirect'
    });
  }
  if (response.status === 429 || response.status >= 500) {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.registrationFailed, {
      message: `Registration failed with ${response.status}`
    });
  }
  if (response.status < 200 || response.status >= 300) {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.registrationRejected, {
      message: `Registration rejected with ${response.status}`
    });
  }

  let json: DcrResponse;
  try {
    json = JSON.parse(response.body) as DcrResponse;
  } catch {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.registrationFailed, {
      message: 'Registration response is not JSON'
    });
  }

  if (typeof json.client_id !== 'string' || json.client_id.length === 0) {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.registrationFailed, {
      message: 'Registration response is missing client_id'
    });
  }

  const returnedMethod =
    typeof json.token_endpoint_auth_method === 'string'
      ? json.token_endpoint_auth_method
      : authMethod;
  if (!MCP_OAUTH_CLIENT_AUTH_METHODS.has(returnedMethod as never)) {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.registrationRejected, {
      message: 'Registration response has unsupported auth method'
    });
  }

  const tokenEndpointAuthMethod = returnedMethod as McpOAuthClientType['tokenEndpointAuthMethod'];
  const clientSecret =
    typeof json.client_secret === 'string' && json.client_secret.length > 0
      ? json.client_secret
      : undefined;

  if (tokenEndpointAuthMethod !== 'none' && !clientSecret) {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.registrationRejected, {
      message: 'Registration response is missing client_secret'
    });
  }

  return {
    clientId: json.client_id,
    tokenEndpointAuthMethod,
    ...(clientSecret ? { clientSecret: encryptSecretValue({ value: clientSecret }) } : {}),
    registeredAt: now,
    ...(typeof json.registration_client_uri === 'string' && json.registration_client_uri
      ? { registrationClientUri: json.registration_client_uri }
      : {}),
    ...(typeof json.registration_access_token === 'string' && json.registration_access_token
      ? {
          registrationAccessToken: encryptSecretValue({
            value: json.registration_access_token
          })
        }
      : {})
  };
};

/**
 * RFC 7592 注销；best effort，永不抛出。
 */
export const deregisterMcpOAuthClient = async (
  client: McpOAuthClientType | undefined
): Promise<boolean> => {
  if (!client?.registrationClientUri || !client.registrationAccessToken) return false;
  try {
    const registrationAccessToken = decryptSecretValue(client.registrationAccessToken);
    if (typeof registrationAccessToken !== 'string' || !registrationAccessToken) return false;
    const response = await requestMcpOAuthHttp({
      url: client.registrationClientUri,
      method: 'DELETE',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${registrationAccessToken}`
      },
      timeoutMs: 3000,
      networkErrorCode: McpOAuthErrorCodeEnum.clientResetFailed
    });
    return response.status >= 200 && response.status < 300;
  } catch {
    return false;
  }
};

export type McpOAuthClientSelection = {
  client: McpOAuthClientType;
  source: McpOAuthClientSource;
};

/**
 * 选择/复用 client。
 *
 * `savedClientSource` 来自节点 `oauth.clientSource`（client 本身不存 source）。
 */
export const selectMcpOAuthClient = async ({
  server,
  clientMode,
  redirectUri,
  cimdClientId,
  cimdAvailable,
  savedClient,
  savedClientSource,
  manualClient,
  now = Date.now()
}: {
  server: McpOAuthServerMetadataType;
  clientMode: McpOAuthClientMode;
  redirectUri: string;
  cimdClientId: string;
  cimdAvailable: boolean;
  savedClient?: McpOAuthClientType;
  savedClientSource?: McpOAuthClientSource;
  manualClient?: McpOAuthManualClientType;
  now?: number;
}): Promise<McpOAuthClientSelection> => {
  const reuse = (source: McpOAuthClientSource): McpOAuthClientSelection | null => {
    if (savedClient && savedClientSource === source) {
      return { client: savedClient, source };
    }
    return null;
  };

  const selectCimd = (): McpOAuthClientSelection => {
    if (!cimdAvailable) {
      throw new McpOAuthApiError(McpOAuthErrorCodeEnum.cimdUnsupported, {
        message: 'CIMD is not supported or FE_DOMAIN is not publicly reachable'
      });
    }
    return (
      reuse('cimd') ?? {
        client: { clientId: cimdClientId, tokenEndpointAuthMethod: 'none' },
        source: 'cimd'
      }
    );
  };

  const selectDcr = async (): Promise<McpOAuthClientSelection> => {
    const saved = reuse('dcr');
    if (saved) return saved;
    const client = await registerMcpOAuthClientDcr({ server, redirectUri, now });
    return { client, source: 'dcr' };
  };

  const selectManual = (): McpOAuthClientSelection => {
    if (manualClient) {
      return { client: buildManualClient(manualClient), source: 'manual' };
    }
    const saved = reuse('manual');
    if (saved) return saved;
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.clientMissing, {
      message: 'Manual client configuration is required'
    });
  };

  if (clientMode === 'cimd') return selectCimd();
  if (clientMode === 'dcr') return selectDcr();
  if (clientMode === 'manual') return selectManual();

  // auto：严格 CIMD → DCR → manual，只有“不支持/不可用”才进入下一步。
  if (cimdAvailable) return selectCimd();
  if (server.registrationEndpoint) return selectDcr();
  if (manualClient || (savedClient && savedClientSource === 'manual')) return selectManual();

  throw new McpOAuthApiError(McpOAuthErrorCodeEnum.clientMissing, {
    message: 'No usable OAuth client'
  });
};
