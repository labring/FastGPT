import { NextAPI } from '@/service/middleware/entry';
import { getDirectSandboxBaseUrl } from '@/service/core/sandbox/proxy';
import { signSandboxProxyToken } from '@fastgpt/service/core/sandbox/proxyToken';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import type { ApiRequestProps } from '@fastgpt/service/type/next';

type Body = {
  sandboxId: string;
};

type Response = {
  token: string;
  exp: number;
  ttl: number;
};

async function handler(req: ApiRequestProps<Body>): Promise<Response> {
  if (req.method !== 'POST') return Promise.reject('Method not allowed');

  const { sandboxId } = req.body;
  if (!sandboxId) return Promise.reject('Missing sandboxId');

  const { teamId } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true,
    per: ReadPermissionVal
  });

  const sandbox = await MongoSandboxInstance.findOne({ sandboxId }).lean();
  if (!sandbox) return Promise.reject('Sandbox not found');
  if (String(sandbox.metadata?.teamId) !== teamId) return Promise.reject('Access denied');
  if (sandbox.status !== SandboxStatusEnum.running) return Promise.reject('Sandbox is not running');

  const endpoint = sandbox.metadata?.endpoint;
  if (!endpoint?.port) return Promise.reject('Sandbox endpoint missing');

  // Resolve the **direct** host:port (bypassing opensandbox HTTP path-proxy) — required
  // because path-proxy doesn't support WebSocket upgrade, which code-server needs for
  // its remote-extension-host channel.
  const directUrl = await getDirectSandboxBaseUrl(
    sandbox.metadata!.providerSandboxId!,
    endpoint.port
  );

  // NOTE: code-server password is intentionally NOT embedded here. It would be visible
  // in the JWT payload (base64, not encrypted) and could leak via URL `?_t=` to logs /
  // browser history. The proxy fetches it on-demand from the internal cs-password API
  // (HMAC-authed by SANDBOX_PROXY_SECRET) and caches the resulting code-server cookie.
  const { token, exp, ttl } = signSandboxProxyToken({
    sid: sandboxId,
    p: endpoint.port,
    t: directUrl
  });

  return { token, exp, ttl };
}

export default NextAPI(handler);
