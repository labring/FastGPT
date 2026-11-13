import { describe, expect, it } from 'vitest';
import { createDatasetProbeHandler } from '../../src/domain/auth/probe/dataset-probe';
import { createOpenApiHealthProbeHandler } from '../../src/domain/auth/probe/openapi-health-probe';
import { runWhoamiProbeChain } from '../../src/domain/auth/probe/probe-chain';
import { createTokenLoginProbeHandler } from '../../src/domain/auth/probe/token-login-probe';
import { createWhoamiProbeHandler } from '../../src/domain/auth/probe/whoami-probe';
import { createFastGptHttpClient } from '../../src/infra/http/fastgpt-http-client';
import { CliAuthError } from '../../src/shared/errors';
import type { CliFetchFn } from '../../src/shared/types';

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

const handlers = [
  createWhoamiProbeHandler(),
  createTokenLoginProbeHandler(),
  createOpenApiHealthProbeHandler(),
  createDatasetProbeHandler()
];

describe('WhoamiProbeChain', () => {
  const objectId = '68ad85a7463006c963799a05';

  it('falls back to tokenLogin on 404 for session credentials', async () => {
    const fetchFn: CliFetchFn = async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.endsWith('/support/user/account/whoami')) {
        return jsonResp({ code: 404, message: 'Not Found', data: null }, 404);
      }
      if (url.endsWith('/support/user/account/tokenLogin')) {
        return jsonResp({
          code: 200,
          data: {
            _id: objectId,
            username: 'alice',
            timezone: 'Asia/Shanghai',
            hasPassword: true,
            status: 'active',
            team: {
              userId: objectId,
              teamId: objectId,
              teamName: 'Team A',
              memberName: 'Alice',
              tmbId: objectId,
              status: 'active',
              permission: {}
            },
            permission: {}
          }
        });
      }
      throw new Error(`Unexpected URL ${url}`);
    };

    const res = await runWhoamiProbeChain({
      handlers,
      client: createFastGptHttpClient({
        baseUrl: 'https://cloud.fastgpt.in/api',
        cliVersion: '0.1.0',
        fetchFn
      }),
      auth: { authType: 'token', secret: 'u:t' }
    });
    expect(res.source).toBe('tokenLogin');
    expect(res.fallbackInfo?.teamName).toBe('Team A');
  });

  it('falls back to openapiHealth and then datasetProbe for API Key credentials', async () => {
    const healthFetch: CliFetchFn = async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.endsWith('/support/user/account/whoami')) {
        return jsonResp({ code: 404, message: 'Not Found', data: null }, 404);
      }
      if (url.includes('/support/openapi/health')) {
        return jsonResp({
          code: 200,
          data: {
            type: 'app',
            valid: true,
            usagePoints: 20,
            maxUsagePoints: 100,
            appId: objectId
          }
        });
      }
      throw new Error(`Unexpected URL ${url}`);
    };

    const secret = 'fastgpt-secret-1234567890abcdef123456';
    const healthRes = await runWhoamiProbeChain({
      handlers,
      client: createFastGptHttpClient({
        baseUrl: 'https://cloud.fastgpt.in/api',
        cliVersion: '0.1.0',
        fetchFn: healthFetch
      }),
      auth: { authType: 'apikey', secret }
    });
    expect(healthRes.source).toBe('openapiHealth');
    expect(healthRes.apiKeyType).toBe('app');
    expect(healthRes.fallbackInfo?.remainingPoints).toBe(80);
    expect(healthRes.warnings[0]).not.toContain(secret);

    const datasetFetch: CliFetchFn = async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.endsWith('/support/user/account/whoami') || url.includes('/support/openapi/health')) {
        return jsonResp({ code: 404, message: 'Not Found', data: null }, 404);
      }
      if (url.endsWith('/core/dataset/listV2')) {
        return jsonResp({ code: 200, data: { list: [], total: 0 } });
      }
      throw new Error(`Unexpected URL ${url}`);
    };

    const legacyRes = await runWhoamiProbeChain({
      handlers,
      client: createFastGptHttpClient({
        baseUrl: 'https://cloud.fastgpt.in/api',
        cliVersion: '0.1.0',
        fetchFn: datasetFetch
      }),
      auth: { authType: 'apikey', secret }
    });
    expect(legacyRes.source).toBe('datasetProbe');
  });

  it('fails fast on non-404 auth errors without falling through chain', async () => {
    const fetchFn: CliFetchFn = async () =>
      jsonResp({ code: 401, statusText: 'unAuthorization', message: 'unAuth', data: null }, 401);

    await expect(
      runWhoamiProbeChain({
        handlers,
        client: createFastGptHttpClient({
          baseUrl: 'https://cloud.fastgpt.in/api',
          cliVersion: '0.1.0',
          fetchFn
        }),
        auth: { authType: 'token', secret: 'bad' }
      })
    ).rejects.toBeInstanceOf(CliAuthError);
  });
});
