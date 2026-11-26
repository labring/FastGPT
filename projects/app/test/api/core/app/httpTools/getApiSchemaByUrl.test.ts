import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiRequestProps } from '@fastgpt/next/type';
import type { GetApiSchemaByUrlBodyType } from '@fastgpt/global/openapi/core/app/httpTools/api';
import { UserConfigError } from '@fastgpt/global/common/error/utils';

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

  it('accepts paths x-* extensions and URI-encoded local refs', async () => {
    mocks.axiosGet.mockResolvedValue({
      data: JSON.stringify({
        openapi: '3.0.3',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          'x-tag': 'internal',
          'x-meta': null,
          '/users': {
            get: {
              operationId: 'getUsers',
              parameters: [{ $ref: '#/components/parameters/My%20Param' }],
              responses: { '200': { description: 'OK' } }
            }
          }
        },
        components: {
          parameters: {
            'My Param': { name: 'q', in: 'query', schema: { type: 'string' } }
          }
        }
      })
    });

    const result = await handler({
      body: {
        url: 'https://example.com/openapi.json'
      }
    } as ApiRequestProps<GetApiSchemaByUrlBodyType>);

    expect(result.paths['x-tag']).toBe('internal');
    expect(result.paths['/users'].get.operationId).toBe('getUsers');
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

    const promise = handler({
      body: {
        url: 'https://example.com/openapi.json'
      }
    } as ApiRequestProps<GetApiSchemaByUrlBodyType>);

    await expect(promise).rejects.toBeInstanceOf(UserConfigError);
    await expect(promise).rejects.toThrow('Unable to resolve $ref pointer');
  });

  it('classifies non-OpenAPI JSON payloads as UserConfigError without [object Object]', async () => {
    mocks.axiosGet.mockResolvedValue({
      data: JSON.stringify({ code: 200, data: { message: 'not openapi' } })
    });

    let caughtError: unknown;
    try {
      await handler({
        body: {
          url: 'https://example.com/api/info'
        }
      } as ApiRequestProps<GetApiSchemaByUrlBodyType>);
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(UserConfigError);
    expect((caughtError as UserConfigError).message).toBe(
      'Schema is not a valid Openapi API definition'
    );
    expect((caughtError as UserConfigError).message).not.toContain('[object Object]');
  });

  it.each(['<html><body>404</body></html>', 'a: [1, 2'])(
    'classifies invalid schema text %j as UserConfigError without leaking local paths',
    async (data) => {
      mocks.axiosGet.mockResolvedValue({ data });

      let caughtError: unknown;
      try {
        await handler({
          body: {
            url: 'https://example.com/openapi.yaml'
          }
        } as ApiRequestProps<GetApiSchemaByUrlBodyType>);
      } catch (error) {
        caughtError = error;
      }

      expect(caughtError).toBeInstanceOf(UserConfigError);
      expect((caughtError as UserConfigError).message).not.toContain(process.cwd());
    }
  );

  it('classifies remote fetch failures as UserConfigError with non-empty message and cause', async () => {
    const fetchError = {
      message: 'Request failed with status code 404',
      response: { status: 404, data: { message: { unexpected: 'object' } } }
    };
    mocks.axiosGet.mockRejectedValue(fetchError);

    let caughtError: unknown;
    try {
      await handler({
        body: {
          url: 'https://example.com/missing.json'
        }
      } as ApiRequestProps<GetApiSchemaByUrlBodyType>);
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(UserConfigError);
    expect((caughtError as UserConfigError).message).toBe('Request failed with status code 404');
    expect((caughtError as UserConfigError).cause).toBe(fetchError);
  });

  it('keeps Error.message instead of raw HTML response bodies when axios fetch fails', async () => {
    const axiosLikeError = Object.assign(new Error('Request failed with status code 502'), {
      response: {
        status: 502,
        data: `<html><body>${'Bad Gateway '.repeat(100)}</body></html>`
      }
    });
    mocks.axiosGet.mockRejectedValue(axiosLikeError);

    let caughtError: unknown;
    try {
      await handler({
        body: {
          url: 'https://example.com/gateway-error.json'
        }
      } as ApiRequestProps<GetApiSchemaByUrlBodyType>);
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(UserConfigError);
    expect((caughtError as UserConfigError).message).toBe('Request failed with status code 502');
    expect((caughtError as UserConfigError).message).not.toContain('<html>');
    expect((caughtError as UserConfigError).cause).toBe(axiosLikeError);
  });

  it.each(['./secret.yaml', '../etc/passwd'])(
    'rejects relative file ref %s without leaking server cwd or file paths',
    async (refValue) => {
      mocks.axiosGet.mockResolvedValue({
        data: JSON.stringify({
          openapi: '3.0.0',
          info: { title: 'Test API', version: '1.0.0' },
          paths: {},
          components: {
            schemas: {
              Leak: {
                $ref: refValue
              }
            }
          }
        })
      });

      let caughtError: unknown;
      try {
        await handler({
          body: {
            url: 'https://example.com/openapi.json'
          }
        } as ApiRequestProps<GetApiSchemaByUrlBodyType>);
      } catch (error) {
        caughtError = error;
      }

      expect(caughtError).toBeInstanceOf(UserConfigError);
      const message = (caughtError as UserConfigError).message;
      expect(message).toContain('Unable to resolve $ref pointer');
      expect(message).toContain('#/components/schemas/Leak');
      expect(message).not.toContain(process.cwd());
      expect(message).not.toContain('secret.yaml');
      expect(message).not.toContain('/etc/passwd');
    }
  );

  it.each([
    { openapi: '3.0.0', info: { title: 'Test API', version: '1.0.0' }, paths: null },
    { openapi: '3.0.0', info: { title: 'Test API', version: '1.0.0' }, paths: { '/users': null } }
  ])('rejects imported schemas with unusable paths structure: %j', async (doc) => {
    mocks.axiosGet.mockResolvedValue({ data: JSON.stringify(doc) });

    await expect(
      handler({
        body: {
          url: 'https://example.com/invalid-paths.json'
        }
      } as ApiRequestProps<GetApiSchemaByUrlBodyType>)
    ).rejects.toBeInstanceOf(UserConfigError);
  });

  it('propagates UserConfigError when checkUrlSafety rejects the URL', async () => {
    mocks.checkUrlSafety.mockRejectedValue(
      new UserConfigError('OpenAPI Schema URL must be a valid URL')
    );

    const promise = handler({
      body: {
        url: 'invalid-url'
      }
    } as ApiRequestProps<GetApiSchemaByUrlBodyType>);

    await expect(promise).rejects.toBeInstanceOf(UserConfigError);
    await expect(promise).rejects.toThrow('OpenAPI Schema URL must be a valid URL');
  });
});
