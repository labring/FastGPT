import type { ApiRequestProps, NextApiResponse } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import {
  assertMcpOAuthEnabled,
  assertMcpOAuthRateLimit,
  buildMcpOAuthCimdDocument,
  createMcpOAuthApiHandler,
  getMcpOAuthCimdClientId,
  getMcpOAuthClientIp,
  getMcpOAuthRedirectUri,
  getMcpOAuthRouteConfig,
  getMcpOAuthCimdEtag,
  isMcpOAuthCimdEtagMatched,
  isMcpOAuthCimdHostAllowed
} from '@fastgpt/service/core/app/mcpOAuth';

/**
 * GET/HEAD /api/core/app/mcpTools/oauth/client-metadata.json（v2.4 §5.4）。
 *
 * 公开 CIMD 文档：Host 必须等于 FE_DOMAIN；支持 ETag/304；无 Cookie 副作用。
 */
async function handler(req: ApiRequestProps<any>, res: NextApiResponse) {
  assertMcpOAuthEnabled();
  const config = getMcpOAuthRouteConfig();

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).end();
  }

  const host = typeof req.headers.host === 'string' ? req.headers.host : undefined;
  if (!isMcpOAuthCimdHostAllowed(host, config.feDomain)) {
    return res.status(404).end();
  }

  await assertMcpOAuthRateLimit('client-metadata-ip', {
    ip: getMcpOAuthClientIp(req as never)
  });

  const document = buildMcpOAuthCimdDocument({
    clientId: getMcpOAuthCimdClientId(),
    redirectUri: getMcpOAuthRedirectUri()
  });
  const etag = getMcpOAuthCimdEtag(document);

  res.setHeader('Cache-Control', 'public, max-age=300, must-revalidate');
  res.setHeader('ETag', etag);

  if (
    isMcpOAuthCimdEtagMatched(
      typeof req.headers['if-none-match'] === 'string' ? req.headers['if-none-match'] : undefined,
      etag
    )
  ) {
    return res.status(304).end();
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'HEAD') {
    return res.status(200).end();
  }
  return res.status(200).json(document);
}

export default NextAPI(createMcpOAuthApiHandler(handler), { csrf: false });
