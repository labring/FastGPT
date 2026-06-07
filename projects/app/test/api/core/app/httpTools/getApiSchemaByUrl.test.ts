import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import type { GetApiSchemaByUrlBodyType } from '@fastgpt/global/openapi/core/app/httpTools/api';

const mocks = vi.hoisted(() => ({
  authCert: vi.fn(),
  checkUrlSafety: vi.fn(),
  axiosGet: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: any) => handler
}));

vi.mock('@fastgpt/service/support/permission/auth/common', () => ({
  authCert: mocks.authCert
}));

vi.mock('@fastgpt/service/common/system/utils', () => ({
  checkUrlSafety: mocks.checkUrlSafety
}));

vi.mock('@fastgpt/service/common/api/axios', () => ({
  axios: {
    get: mocks.axiosGet
  }
}));

import { handler } from '@/pages/api/core/app/httpTools/getApiSchemaByUrl';

describe('getApiSchemaByUrl handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authCert.mockResolvedValue({ teamId: 'team-1', tmbId: 'tmb-1' });
    mocks.checkUrlSafety.mockResolvedValue(undefined);
  });

  it('downloads schema through guarded axios before bundling', async () => {
    mocks.axiosGet.mockResolvedValue({
      data: JSON.stringify({
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              operationId: 'getUsers',
              responses: { '200': { description: 'OK' } }
            }
          }
        }
      })
    });

    const result = await handler({
      body: {
        url: 'https://example.com/openapi.json'
      }
    } as ApiRequestProps<GetApiSchemaByUrlBodyType>);

    expect(mocks.authCert).toHaveBeenCalledWith({ req: expect.any(Object), authToken: true });
    expect(mocks.checkUrlSafety).toHaveBeenCalledWith(
      'https://example.com/openapi.json',
      'OpenAPI Schema URL'
    );
    expect(mocks.axiosGet).toHaveBeenCalledWith(
      'https://example.com/openapi.json',
      expect.objectContaining({
        responseType: 'text',
        maxRedirects: 0,
        timeout: 30000
      })
    );
    expect(result.paths['/users']).toBeDefined();
  });

  it('rejects external refs from downloaded schemas', async () => {
    mocks.axiosGet.mockResolvedValue({
      data: JSON.stringify({
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {},
        components: {
          schemas: {
            Leak: {
              $ref: 'http://169.254.169.254/latest/meta-data/iam/security-credentials/'
            }
          }
        }
      })
    });

    await expect(
      handler({
        body: {
          url: 'https://example.com/openapi.json'
        }
      } as ApiRequestProps<GetApiSchemaByUrlBodyType>)
    ).rejects.toThrow('Unable to resolve $ref pointer');
  });
});
