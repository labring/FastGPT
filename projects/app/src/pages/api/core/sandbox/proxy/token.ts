import { NextAPI } from '@/service/middleware/entry';
import { signSandboxProxyToken } from '@fastgpt/service/core/sandbox/proxyToken';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { authSkill } from '@fastgpt/service/support/permission/skill/auth';
import { ReadPermissionVal, WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import { getSandboxProviderConfig } from '@fastgpt/service/core/ai/sandbox/config';
import { SandboxTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import {
  SandboxProxyTokenBodySchema,
  SandboxProxyTokenResponseSchema,
  type SandboxProxyTokenResponse
} from '@fastgpt/global/openapi/core/ai/sandbox/api';

async function handler(req: ApiRequestProps): Promise<SandboxProxyTokenResponse> {
  if (req.method !== 'POST') return Promise.reject('Method not allowed');

  const { sandboxId, proxyRevision } = SandboxProxyTokenBodySchema.parse(req.body);
  const providerConfig = getSandboxProviderConfig();

  const sandbox = await MongoSandboxInstance.findOne({
    provider: providerConfig.provider,
    sandboxId
  }).lean();
  if (!sandbox) return Promise.reject('Sandbox not found');

  const { teamId } =
    sandbox.type === SandboxTypeEnum.editDebug
      ? await authSkill({
          req,
          authToken: true,
          authApiKey: true,
          skillId: sandbox.metadata?.skillId ?? sandbox.appId ?? '',
          per: WritePermissionVal
        })
      : await authUserPer({
          req,
          authToken: true,
          authApiKey: true,
          per: ReadPermissionVal
        });

  if (String(sandbox.metadata?.teamId) !== teamId) return Promise.reject('Access denied');

  // NOTE: code-server password is intentionally NOT embedded here. It would be visible
  // in the JWT payload (base64, not encrypted) and could leak via URL `?_t=` to logs /
  // browser history. The proxy fetches the provider target on demand through an internal
  // API and caches the resulting code-server cookie.
  const result = signSandboxProxyToken({
    sid: sandboxId,
    svc: 'code-server',
    ...(proxyRevision ? { rev: proxyRevision } : {})
  });

  return SandboxProxyTokenResponseSchema.parse(result);
}

export default NextAPI(handler);
