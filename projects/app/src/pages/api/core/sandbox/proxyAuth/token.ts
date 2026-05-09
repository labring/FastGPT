import { NextAPI } from '@/service/middleware/entry';
import { signSandboxProxyToken } from '@fastgpt/service/core/sandbox/proxyToken';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import {
  SandboxProxyTokenBodySchema,
  SandboxProxyTokenResponseSchema,
  type SandboxProxyTokenResponse
} from '@fastgpt/global/openapi/core/ai/sandbox/api';

async function handler(req: ApiRequestProps): Promise<SandboxProxyTokenResponse> {
  if (req.method !== 'POST') return Promise.reject('Method not allowed');

  const { sandboxId } = SandboxProxyTokenBodySchema.parse(req.body);

  const { teamId } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true,
    per: ReadPermissionVal
  });

  const sandbox = await MongoSandboxInstance.findOne({ sandboxId }).lean();
  if (!sandbox) return Promise.reject('Sandbox not found');
  if (String(sandbox.metadata?.teamId) !== teamId) return Promise.reject('Access denied');

  // NOTE: code-server password is intentionally NOT embedded here. It would be visible
  // in the JWT payload (base64, not encrypted) and could leak via URL `?_t=` to logs /
  // browser history. The proxy fetches the provider target on demand through an internal
  // API and caches the resulting code-server cookie.
  const result = signSandboxProxyToken({
    sid: sandboxId,
    svc: 'code-server'
  });

  return SandboxProxyTokenResponseSchema.parse(result);
}

export default NextAPI(handler);
