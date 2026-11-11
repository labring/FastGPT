import { OpenAPIUserSchema } from '@fastgpt/global/openapi/support/user/account/login/api';
import type { WhoamiProbeHandler } from './probe-chain';

/**
 * 兼容旧版服务端的 Session 降级策略：调用 `GET /support/user/account/tokenLogin`。
 */
export function createTokenLoginProbeHandler(): WhoamiProbeHandler {
  return {
    name: 'tokenLogin',
    supports: (auth) => auth.authType === 'token',
    probe: async ({ client, auth }) => {
      const rawUser = await client.request<unknown>({
        method: 'GET',
        path: '/support/user/account/tokenLogin',
        auth
      });
      const user = OpenAPIUserSchema.parse(rawUser);

      return {
        source: 'tokenLogin',
        supportsWhoami: false,
        authType: 'token',
        fallbackInfo: {
          userId: user._id,
          username: user.username,
          avatar: user.avatar,
          teamId: user.team.teamId,
          teamName: user.team.teamName,
          tmbId: user.team.tmbId
        },
        warnings: [
          'Server does not expose /support/user/account/whoami; fell back to /support/user/account/tokenLogin (session expiry unavailable).'
        ]
      };
    }
  };
}
