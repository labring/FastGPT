import type { ApiRequestProps, NextApiResponse } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { authAppByTmbId } from '@fastgpt/service/support/permission/app/auth';
import {
  McpOAuthCallbackQuerySchema,
  type McpOAuthCallbackQueryType
} from '@fastgpt/global/openapi/core/app/mcpTools/oauth';
import { decryptSecretValue } from '@fastgpt/service/common/secret/utils';
import {
  McpOAuthApiError,
  McpOAuthErrorCodeEnum,
  assertMcpOAuthBindCookie,
  assertMcpOAuthEnabled,
  assertMcpOAuthOriginAllowed,
  assertMcpOAuthRateLimit,
  buildMcpOAuthCallbackRedirect,
  clearMcpOAuthBindCookie,
  consumeMcpOAuthState,
  createMcpOAuthApiHandler,
  exchangeMcpOAuthAuthorizationCode,
  getMcpOAuthClientIp,
  getMcpOAuthRouteConfig,
  getMcpToolSetVersionDoc,
  getNodeMcpToolSet,
  normalizeIssuer,
  normalizeMcpResource,
  parseMcpOAuthState,
  resolveMcpOAuthNode,
  sha256Hex,
  updateMcpOAuthNodeFields
} from '@fastgpt/service/core/app/mcpOAuth';

/**
 * GET /api/core/app/mcpTools/oauth/callback（v2.4 §4.5）。
 *
 * `csrf:false`：AS 302 回来的请求没有 `fastgpt-web-request` 头。
 * state 解密前失败 → JSON；解密后失败 → 固定详情页 302。
 */

async function handler(req: ApiRequestProps<any>, res: NextApiResponse) {
  assertMcpOAuthEnabled();
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }

  const config = getMcpOAuthRouteConfig();
  await assertMcpOAuthRateLimit('callback-ip', {
    ip: getMcpOAuthClientIp(req as never)
  });

  const query = (req.query ?? {}) as Partial<McpOAuthCallbackQueryType>;
  if (!query.state) {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.stateMissing, {
      message: 'OAuth callback is missing state'
    });
  }

  const parsedQuery = McpOAuthCallbackQuerySchema.safeParse(query);
  if (!parsedQuery.success) {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.stateInvalid, {
      message: 'OAuth callback query is invalid'
    });
  }
  const callbackQuery = parsedQuery.data;

  assertMcpOAuthOriginAllowed({
    origin: typeof req.headers.origin === 'string' ? req.headers.origin : undefined,
    feDomain: config.feDomain
  });

  // 解密失败时没有可信 appId，按设计返回 JSON 400。
  const payload = parseMcpOAuthState(callbackQuery.state);
  await assertMcpOAuthRateLimit('callback-app', { appId: payload.appId });

  const redirectError = (error: unknown) => {
    const code =
      error instanceof McpOAuthApiError
        ? error.oauthCode
        : McpOAuthErrorCodeEnum.internalError;
    return finishRedirect({ res, payload, success: false, code });
  };

  try {
    const record = await consumeMcpOAuthState({
      stateHash: sha256Hex(payload.n)
    });
    assertMcpOAuthBindCookie({
      cookieHeader: typeof req.headers.cookie === 'string' ? req.headers.cookie : undefined,
      appId: payload.appId,
      bindCookieHash: record.bindCookieHash
    });

    // 二次鉴权：完全使用 state 中的 tmbId/appId，不信任 query。
    let app: Awaited<ReturnType<typeof authAppByTmbId>>['app'];
    try {
      ({ app } = await authAppByTmbId({
        tmbId: payload.tmbId,
        appId: payload.appId,
        per: ManagePermissionVal
      }));
    } catch (error) {
      throw new McpOAuthApiError(McpOAuthErrorCodeEnum.stateContextChanged, {
        message: 'OAuth callback member is no longer authorized',
        cause: error
      });
    }

    if (app.type !== AppTypeEnum.mcpToolSet || String(app.teamId) !== payload.teamId) {
      throw new McpOAuthApiError(McpOAuthErrorCodeEnum.stateContextChanged, {
        message: 'OAuth callback app context changed'
      });
    }

    const version = await getMcpToolSetVersionDoc(payload.appId);
    const node = resolveMcpOAuthNode(version, payload.nodeId);
    const toolSet = getNodeMcpToolSet(node);
    if (!toolSet?.url || toolSet.authMode !== 'oauth') {
      throw new McpOAuthApiError(McpOAuthErrorCodeEnum.stateContextChanged, {
        message: 'OAuth toolset node changed'
      });
    }
    if (normalizeMcpResource(toolSet.url) !== payload.resource) {
      throw new McpOAuthApiError(McpOAuthErrorCodeEnum.stateContextChanged, {
        message: 'OAuth toolset URL changed'
      });
    }

    const oauth = toolSet.oauth;
    if (
      !oauth?.client?.clientId ||
      sha256Hex(oauth.client.clientId) !== payload.clientIdHash
    ) {
      throw new McpOAuthApiError(McpOAuthErrorCodeEnum.stateContextChanged, {
        message: 'OAuth client changed'
      });
    }

    if (callbackQuery.error) {
      throw new McpOAuthApiError(McpOAuthErrorCodeEnum.accessDenied, {
        message: `Authorization server returned ${callbackQuery.error}`
      });
    }
    if (!callbackQuery.code) {
      throw new McpOAuthApiError(McpOAuthErrorCodeEnum.accessDenied, {
        message: 'Authorization server did not return a code'
      });
    }

    if (callbackQuery.iss && normalizeIssuer(callbackQuery.iss) !== payload.issuer) {
      throw new McpOAuthApiError(McpOAuthErrorCodeEnum.issuerMismatch, {
        message: 'Authorization server issuer does not match state'
      });
    }

    const server = oauth.server;
    if (!server?.tokenEndpoint) {
      throw new McpOAuthApiError(McpOAuthErrorCodeEnum.stateContextChanged, {
        message: 'OAuth server metadata changed'
      });
    }

    const clientSecret = oauth.client.clientSecret
      ? decryptSecretValue(oauth.client.clientSecret)
      : undefined;

    const nextToken = await exchangeMcpOAuthAuthorizationCode({
      tokenEndpoint: server.tokenEndpoint,
      clientId: oauth.client.clientId,
      clientSecret: typeof clientSecret === 'string' ? clientSecret : undefined,
      authMethod: oauth.client.tokenEndpointAuthMethod,
      code: callbackQuery.code,
      redirectUri: payload.redirectUri,
      codeVerifier: payload.codeVerifier,
      resource: payload.resource,
      requestedScope: payload.scope
    });

    const expectedSeq = oauth.credentialSeq ?? 0;
    const now = Date.now();
    const written = await updateMcpOAuthNodeFields({
      appId: payload.appId,
      nodeId: payload.nodeId,
      expectedCredentialSeq: expectedSeq,
      set: {
        token: nextToken,
        client: oauth.client,
        lastError: null,
        authorizedAt: now,
        authorizedBy: payload.tmbId
      },
      incrementSeq: true
    });

    if (!written.matched) {
      const latestVersion = await getMcpToolSetVersionDoc(payload.appId);
      const latestNode = resolveMcpOAuthNode(latestVersion, payload.nodeId);
      const latestOAuth = getNodeMcpToolSet(latestNode)?.oauth;
      if ((latestOAuth?.credentialSeq ?? 0) > expectedSeq) {
        throw new McpOAuthApiError(McpOAuthErrorCodeEnum.stateContextChanged, {
          message: 'OAuth credential changed before token write'
        });
      }
      throw new McpOAuthApiError(McpOAuthErrorCodeEnum.tokenPersistFailed, {
        message: 'Failed to persist OAuth token'
      });
    }

    return finishRedirect({ res, payload, success: true });
  } catch (error) {
    return redirectError(error);
  }
}

function finishRedirect({
  res,
  payload,
  success,
  code
}: {
  res: NextApiResponse;
  payload: { appId: string };
  success: boolean;
  code?: string;
}) {
  const config = getMcpOAuthRouteConfig();
  const location = buildMcpOAuthCallbackRedirect({
    feDomain: config.feDomain,
    appId: payload.appId,
    success,
    code
  });

  res.setHeader(
    'Set-Cookie',
    clearMcpOAuthBindCookie({ appId: payload.appId, feDomain: config.feDomain })
  );
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Location', location);
  return res.status(302).end();
}

export default NextAPI(createMcpOAuthApiHandler(handler), { csrf: false });
