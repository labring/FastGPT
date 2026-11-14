import { ApiKeyHealthResponseSchema } from '@fastgpt/global/openapi/support/openapi/api';
import { ApiKeyTypeEnum } from '@fastgpt/global/support/openapi/constants';
import { maskSecret } from '../../../shared/redact';
import type { WhoamiProbeHandler } from './probe-chain';

/**
 * 兼容旧版服务端的 API Key 降级策略：调用 `GET /support/openapi/health`。
 */
export function createOpenApiHealthProbeHandler(): WhoamiProbeHandler {
  return {
    name: 'openapiHealth',
    supports: (auth) => auth.authType === 'apikey',
    probe: async ({ client, auth }) => {
      const rawHealth = await client.request<unknown>({
        method: 'GET',
        path: '/support/openapi/health',
        query: { apiKey: auth.secret }
      });
      const health = ApiKeyHealthResponseSchema.parse(rawHealth);
      const remainingPoints =
        health.maxUsagePoints < 0 ? null : Math.max(0, health.maxUsagePoints - health.usagePoints);

      return {
        source: 'openapiHealth',
        supportsWhoami: false,
        authType: 'apikey',
        apiKeyType: health.type === ApiKeyTypeEnum.app ? 'app' : 'personal',
        fallbackInfo: {
          boundAppId: health.appId,
          usagePoints: health.usagePoints,
          maxUsagePoints: health.maxUsagePoints,
          remainingPoints
        },
        warnings: [
          `Server does not expose /support/user/account/whoami; fell back to /support/openapi/health for ${maskSecret(auth.secret)} (user/team metadata unavailable).`
        ]
      };
    }
  };
}
