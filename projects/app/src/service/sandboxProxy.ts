import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import { parseHeaderCert } from '@fastgpt/service/support/permission/auth/common';
import type { IncomingHttpHeaders } from 'http';
import { upsertProxySession, getProxySession } from './sandboxProxyUtils';

const dev = process.env.NODE_ENV !== 'production';

// Resolve the proxy target URL after authenticating the request.
// Used by the proxyAuth API route (loaded via Next.js webpack, not tsx).
export async function getSandboxProxyTarget(
  headers: IncomingHttpHeaders,
  sandboxId: string,
  targetPort: number
): Promise<string> {
  if (targetPort < 1 || targetPort > 65535) {
    throw Object.assign(new Error('Invalid port'), { statusCode: 400 });
  }

  // Try full cookie/token auth first.
  // On success: upsert a proxy session so that subsequent requests from
  // sandboxed iframes (opaque origin, no cookies) can still be served.
  // On auth failure only: fall back to an existing proxy session.
  let authTeamId: string;
  try {
    const { teamId } = await parseHeaderCert({
      req: { headers, query: {} } as any,
      authToken: true,
      authApiKey: true
    });
    authTeamId = teamId;
  } catch {
    // No valid credential — check in-process proxy session for this sandboxId
    const session = getProxySession(sandboxId);
    if (session) {
      dev && console.log(`[sandboxProxy] session fallback sandboxId=${sandboxId}`);
      return `${session.protocol}://${session.host}:${targetPort}`;
    }
    throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
  }

  dev && console.log(`[sandboxProxy] lookup sandboxId=${sandboxId} authTeamId=${authTeamId}`);
  const sandbox = await MongoSandboxInstance.findOne({ sandboxId }).lean();
  if (!sandbox) throw Object.assign(new Error('Sandbox not found'), { statusCode: 404 });

  dev &&
    console.log(
      `[sandboxProxy] found sandbox _id=${sandbox._id} sandboxTeamId=${sandbox.metadata?.teamId} authTeamId=${authTeamId} status=${sandbox.status}`
    );
  if (String(sandbox.metadata?.teamId) !== authTeamId) {
    throw Object.assign(new Error('Access denied'), { statusCode: 403 });
  }
  if (sandbox.status !== SandboxStatusEnum.running) {
    throw Object.assign(new Error('Sandbox is not running'), { statusCode: 503 });
  }

  const { host, protocol } = sandbox.metadata!.endpoint!;
  // Cache target for subsequent cookie-less sub-requests (sandboxed iframe)
  upsertProxySession(sandboxId, authTeamId, host, protocol);
  return `${protocol}://${host}:${targetPort}`;
}
