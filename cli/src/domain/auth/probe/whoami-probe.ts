import { WhoamiResponseSchema } from '@fastgpt/global/openapi/support/user/account/whoami/api';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import type { WhoamiProbeHandler } from './probe-chain';

/**
 * 首选探测策略：调用统一的 `GET /support/user/account/whoami` 接口。
 */
export function createWhoamiProbeHandler(): WhoamiProbeHandler {
  return {
    name: 'whoami',
    supports: () => true,
    probe: async ({ client, auth }) => {
      const raw = await client.request<unknown>({
        method: 'GET',
        path: '/support/user/account/whoami',
        auth
      });
      const detail = WhoamiResponseSchema.parse(raw);

      return {
        source: 'whoami',
        supportsWhoami: true,
        authType: detail.authType,
        ...(detail.authType === AuthUserTypeEnum.apikey ? { apiKeyType: detail.apiKeyType } : {}),
        detail,
        warnings: []
      };
    }
  };
}
