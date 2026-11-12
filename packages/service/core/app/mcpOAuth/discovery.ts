import { createHash } from 'node:crypto';
import z from 'zod';
import type { McpOAuthServerMetadataType } from '@fastgpt/global/core/app/tool/mcpTool/oauthConfig';
import { isValidMcpOAuthScope } from '@fastgpt/global/core/app/tool/mcpTool/oauth';
import { McpOAuthApiError } from './errors';
import { McpOAuthErrorCodeEnum } from '@fastgpt/global/core/app/tool/mcpTool/oauth';
import type { McpOAuthDiscoveryResult } from './types';
import {
  MCP_OAUTH_MAX_RESPONSE_BYTES,
  isMcpOAuthInsecureHttpAllowed,
  assertMcpOAuthUrlSafe,
  requestMcpOAuthHttp
} from './httpRuntime';

/**
 * OAuth 发现（v2.4 §5.1–§5.3）。
 *
 * 顺序：无令牌 MCP `initialize` → PRM（challenge / path-aware / root）→ AS metadata。
 * PRM 404/不可用时回退到 MCP origin 的 `oauth-authorization-server`（MCP 2025-03-26）。
 * 跨源 AS 端点允许；每个端点独立做 SSRF/协议/代理校验，禁止跟随重定向。
 */

export const normalizeIssuer = (issuer: string) => new URL(issuer).toString();

export const normalizeMcpResource = (resource: string) => {
  const url = new URL(resource);
  url.hash = '';
  return url.toString().replace(/\/$/, '');
};

const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
};

export const hashMcpOAuthServerMetadata = (server: McpOAuthServerMetadataType) =>
  createHash('sha256')
    .update(
      canonicalJson({
        issuer: server.issuer,
        authorizationEndpoint: server.authorizationEndpoint,
        tokenEndpoint: server.tokenEndpoint,
        registrationEndpoint: server.registrationEndpoint,
        revocationEndpoint: server.revocationEndpoint,
        tokenEndpointAuthMethodsSupported: server.tokenEndpointAuthMethodsSupported,
        codeChallengeMethodsSupported: server.codeChallengeMethodsSupported,
        clientIdMetadataDocumentSupported: server.clientIdMetadataDocumentSupported,
        scopesSupported: server.scopesSupported
      })
    )
    .digest('hex');

const parseBearerResourceMetadata = (header: string | null): string | undefined => {
  if (!header) return undefined;
  const match = header.match(/resource_metadata\s*=\s*"([^"]+)"/i);
  return match?.[1];
};

const pruneTrailingSlash = (pathname: string) =>
  pathname === '/' ? '' : pathname.replace(/\/$/, '');

const buildWellKnownCandidates = (base: string, suffix: string) => {
  const url = new URL(base);
  const path = pruneTrailingSlash(url.pathname);
  const origin = url.origin;
  return [
    `${origin}/.well-known/${suffix}${path}`,
    `${origin}/.well-known/${suffix}`,
    `${origin}${path}/.well-known/${suffix}`
  ];
};

type McpProbeResult = {
  anonymous: boolean;
  resourceMetadataUrl?: string;
};

/**
 * 无令牌 `initialize` 探活；用于拿到 `WWW-Authenticate` challenge。
 * 3xx 不跟随，直接 `discovery_failed`。
 */
export const probeMcpInitialize = async ({
  mcpUrl,
  timeoutMs
}: {
  mcpUrl: string;
  timeoutMs?: number;
}): Promise<McpProbeResult> => {
  const response = await requestMcpOAuthHttp({
    url: mcpUrl,
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'FastGPT', version: '1.0.0' }
      }
    }),
    timeoutMs,
    networkErrorCode: McpOAuthErrorCodeEnum.discoveryFailed
  });

  if (response.status >= 300 && response.status < 400) {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.discoveryFailed, {
      message: 'MCP initialize returned a redirect'
    });
  }

  if (response.status === 401 || response.status === 403) {
    return {
      anonymous: false,
      resourceMetadataUrl: parseBearerResourceMetadata(response.headers.get('www-authenticate'))
    };
  }

  if (response.status >= 200 && response.status < 300) {
    return { anonymous: true };
  }

  throw new McpOAuthApiError(McpOAuthErrorCodeEnum.discoveryFailed, {
    message: `MCP initialize returned ${response.status}`
  });
};

const ProtectedResourceMetadataSchema = z.object({
  resource: z.string().max(2048).optional(),
  authorization_servers: z.array(z.string().max(2048)).min(1).max(16),
  bearer_methods_supported: z.array(z.string().max(32)).max(16).optional(),
  scopes_supported: z.array(z.string().max(256)).max(64).optional()
});

export type McpProtectedResourceMetadataType = z.infer<typeof ProtectedResourceMetadataSchema>;

const fetchProtectedResourceMetadata = async ({
  candidateUrl,
  expectedResource,
  allowInsecureHttp
}: {
  candidateUrl: string;
  expectedResource: string;
  allowInsecureHttp?: boolean;
}): Promise<McpProtectedResourceMetadataType | null> => {
  const response = await requestMcpOAuthHttp({
    url: candidateUrl,
    method: 'GET',
    headers: { accept: 'application/json' },
    allowInsecureHttp,
    networkErrorCode: McpOAuthErrorCodeEnum.discoveryFailed
  });

  // 404/其它非 2xx 视为该候选不可用，继续尝试下一个候选。
  if (response.status < 200 || response.status >= 300) return null;

  let json: unknown;
  try {
    json = JSON.parse(response.body);
  } catch {
    return null;
  }

  const parsed = ProtectedResourceMetadataSchema.safeParse(json);
  if (!parsed.success) return null;

  if (parsed.data.resource) {
    let normalized: string;
    try {
      normalized = normalizeMcpResource(parsed.data.resource);
    } catch {
      throw new McpOAuthApiError(McpOAuthErrorCodeEnum.prmResourceMismatch, {
        message: 'PRM resource is not a valid URL'
      });
    }
    if (normalized !== expectedResource) {
      throw new McpOAuthApiError(McpOAuthErrorCodeEnum.prmResourceMismatch, {
        message: 'PRM resource does not match the MCP URL'
      });
    }
  }

  if (
    parsed.data.bearer_methods_supported &&
    !parsed.data.bearer_methods_supported.map((method) => method.toLowerCase()).includes('header')
  ) {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.unsupportedFlow, {
      message: 'PRM does not support Bearer header'
    });
  }

  return parsed.data;
};

const discoverProtectedResource = async ({
  mcpUrl,
  probe,
  allowInsecureHttp
}: {
  mcpUrl: string;
  probe: McpProbeResult;
  allowInsecureHttp?: boolean;
}): Promise<{ resource: string; authorizationServers: string[] } | null> => {
  const expectedResource = normalizeMcpResource(mcpUrl);
  const url = new URL(mcpUrl);
  const pathCandidate = `${url.origin}/.well-known/oauth-protected-resource${pruneTrailingSlash(
    url.pathname
  )}`;
  const rootCandidate = `${url.origin}/.well-known/oauth-protected-resource`;

  const candidates = [
    ...(probe.resourceMetadataUrl ? [probe.resourceMetadataUrl] : []),
    pathCandidate,
    rootCandidate
  ].filter((candidate, index, list) => list.indexOf(candidate) === index);

  for (const candidate of candidates) {
    const metadata = await fetchProtectedResourceMetadata({
      candidateUrl: candidate,
      expectedResource,
      allowInsecureHttp
    });
    if (metadata) {
      for (const authorizationServer of metadata.authorization_servers) {
        await assertMcpOAuthUrlSafe(authorizationServer, { allowInsecureHttp });
      }
      return {
        resource: expectedResource,
        authorizationServers: metadata.authorization_servers
      };
    }
  }

  return null;
};

const AuthorizationServerMetadataSchema = z
  .object({
    issuer: z.string().max(2048),
    authorization_endpoint: z.string().max(2048),
    token_endpoint: z.string().max(2048),
    registration_endpoint: z.string().max(2048).optional(),
    revocation_endpoint: z.string().max(2048).optional(),
    token_endpoint_auth_methods_supported: z.array(z.string().max(64)).max(16).optional(),
    code_challenge_methods_supported: z.array(z.string().max(32)).max(16).optional(),
    client_id_metadata_document_supported: z.boolean().optional(),
    scopes_supported: z.array(z.string().max(256)).max(64).optional()
  })
  .passthrough();

export type McpAuthorizationServerMetadataDocument = z.infer<
  typeof AuthorizationServerMetadataSchema
>;

/**
 * RFC 8414 / OpenID Discovery；`issuer` 必须与目标 issuer 逐字符相等。
 */
export const discoverAuthorizationServerMetadata = async ({
  issuer,
  allowInsecureHttp = isMcpOAuthInsecureHttpAllowed()
}: {
  issuer: string;
  allowInsecureHttp?: boolean;
}): Promise<McpOAuthServerMetadataType> => {
  const normalizedIssuer = normalizeIssuer(issuer);
  await assertMcpOAuthUrlSafe(normalizedIssuer, { allowInsecureHttp });

  const candidates = buildWellKnownCandidates(
    normalizedIssuer,
    'oauth-authorization-server'
  ).concat(buildWellKnownCandidates(normalizedIssuer, 'openid-configuration'));

  let lastError: unknown;
  for (const candidate of candidates) {
    let response: Awaited<ReturnType<typeof requestMcpOAuthHttp>>;
    try {
      response = await requestMcpOAuthHttp({
        url: candidate,
        method: 'GET',
        headers: { accept: 'application/json' },
        allowInsecureHttp,
        networkErrorCode: McpOAuthErrorCodeEnum.discoveryFailed
      });
    } catch (error) {
      lastError = error;
      continue;
    }

    if (response.status < 200 || response.status >= 300) continue;

    let json: unknown;
    try {
      json = JSON.parse(response.body);
    } catch {
      continue;
    }

    const parsed = AuthorizationServerMetadataSchema.safeParse(json);
    if (!parsed.success) continue;

    let documentIssuer: string;
    try {
      documentIssuer = normalizeIssuer(parsed.data.issuer);
    } catch {
      throw new McpOAuthApiError(McpOAuthErrorCodeEnum.issuerMismatch, {
        message: 'Authorization server issuer is not a valid URL'
      });
    }
    if (documentIssuer !== normalizedIssuer) {
      throw new McpOAuthApiError(McpOAuthErrorCodeEnum.issuerMismatch, {
        message: 'Authorization server issuer does not match'
      });
    }

    const authorizationEndpoint = await assertMcpOAuthUrlSafe(parsed.data.authorization_endpoint, {
      allowInsecureHttp
    });
    const tokenEndpoint = await assertMcpOAuthUrlSafe(parsed.data.token_endpoint, {
      allowInsecureHttp
    });
    const registrationEndpoint = parsed.data.registration_endpoint
      ? await assertMcpOAuthUrlSafe(parsed.data.registration_endpoint, { allowInsecureHttp })
      : undefined;
    const revocationEndpoint = parsed.data.revocation_endpoint
      ? await assertMcpOAuthUrlSafe(parsed.data.revocation_endpoint, { allowInsecureHttp })
      : undefined;

    return {
      issuer: normalizedIssuer,
      authorizationEndpoint,
      tokenEndpoint,
      registrationEndpoint,
      revocationEndpoint,
      tokenEndpointAuthMethodsSupported: parsed.data.token_endpoint_auth_methods_supported,
      codeChallengeMethodsSupported: parsed.data.code_challenge_methods_supported,
      clientIdMetadataDocumentSupported: parsed.data.client_id_metadata_document_supported,
      scopesSupported: parsed.data.scopes_supported,
      source: 'discovered',
      fetchedAt: Date.now()
    };
  }

  throw new McpOAuthApiError(McpOAuthErrorCodeEnum.discoveryFailed, {
    message: 'Authorization server metadata is unavailable',
    cause: lastError
  });
};

export type McpOAuthDiscoveryOutput = McpOAuthDiscoveryResult & {
  /** 仅用于内存比较，不写回 `oauth.server`（v2.4 明确删除 server.configHash）。 */
  configHash: string;
};

/**
 * 完整发现流程。
 *
 * PRM 404/不可用 → 以 MCP origin 为 issuer 拉根 AS metadata。
 * `previousIssuer` 与本次 issuer 不一致 → `issuer_changed`。
 */
export const discoverMcpOAuth = async ({
  mcpUrl,
  previousIssuer,
  allowInsecureHttp = isMcpOAuthInsecureHttpAllowed(),
  timeoutMs
}: {
  mcpUrl: string;
  previousIssuer?: string;
  allowInsecureHttp?: boolean;
  timeoutMs?: number;
}): Promise<McpOAuthDiscoveryOutput> => {
  await assertMcpOAuthUrlSafe(mcpUrl, { allowInsecureHttp });

  const probe = await probeMcpInitialize({ mcpUrl, timeoutMs });
  const protectedResource = await discoverProtectedResource({
    mcpUrl,
    probe,
    allowInsecureHttp
  });

  let server: McpOAuthServerMetadataType | undefined;
  let resource: string;

  if (protectedResource) {
    resource = protectedResource.resource;
    let lastError: unknown;
    for (const authorizationServer of protectedResource.authorizationServers) {
      try {
        server = await discoverAuthorizationServerMetadata({
          issuer: authorizationServer,
          allowInsecureHttp
        });
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!server) {
      throw lastError instanceof McpOAuthApiError
        ? lastError
        : new McpOAuthApiError(McpOAuthErrorCodeEnum.discoveryFailed, {
            message: 'No usable authorization server metadata',
            cause: lastError
          });
    }
  } else {
    // MCP 2025-03-26 回退：MCP origin 即 issuer。
    const origin = new URL(mcpUrl).origin;
    resource = normalizeMcpResource(mcpUrl);
    server = await discoverAuthorizationServerMetadata({
      issuer: origin,
      allowInsecureHttp
    });
  }

  if (previousIssuer) {
    let normalizedPreviousIssuer: string;
    try {
      normalizedPreviousIssuer = normalizeIssuer(previousIssuer);
    } catch {
      throw new McpOAuthApiError(McpOAuthErrorCodeEnum.issuerChanged, {
        message: 'Previous authorization server issuer is invalid'
      });
    }
    if (normalizedPreviousIssuer !== server.issuer) {
      throw new McpOAuthApiError(McpOAuthErrorCodeEnum.issuerChanged, {
        message: 'Authorization server issuer changed'
      });
    }
  }

  return {
    server,
    issuer: server.issuer,
    resource,
    configHash: hashMcpOAuthServerMetadata(server)
  };
};

/** 供路由在写回前再次确认发现结果可用（scope 语法沿用全局规则）。 */
export const assertMcpOAuthDiscoveredScope = (scope?: string) => {
  if (scope !== undefined && !isValidMcpOAuthScope(scope)) {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.scopeInvalid, {
      message: 'Requested scope is invalid'
    });
  }
  return scope;
};

export const MCP_OAUTH_DISCOVERY_MAX_BYTES = MCP_OAUTH_MAX_RESPONSE_BYTES;
