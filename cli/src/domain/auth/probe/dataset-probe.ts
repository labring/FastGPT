import type { WhoamiProbeHandler } from './probe-chain';

/**
 * 最早期服务端兜底探活策略：使用轻量只读列表请求验证 API Key 连通性。
 */
export function createDatasetProbeHandler(): WhoamiProbeHandler {
  return {
    name: 'datasetProbe',
    supports: (auth) => auth.authType === 'apikey',
    probe: async ({ client, auth }) => {
      await client.request<unknown>({
        method: 'POST',
        path: '/core/dataset/listV2',
        body: { pageNum: 1, pageSize: 1 },
        auth
      });

      return {
        source: 'datasetProbe',
        supportsWhoami: false,
        authType: 'apikey',
        apiKeyType: 'personal',
        warnings: [
          'Server lacks both /whoami and /support/openapi/health; verified connectivity via /core/dataset/listV2.'
        ]
      };
    }
  };
}
