import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { evictProxyTarget, resolveProxyTarget } from '../src/proxyTarget';

describe('resolveProxyTarget', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    evictProxyTarget('sandbox-1');
    vi.unstubAllGlobals();
  });

  const targetResponse = (origin: string) =>
    Response.json({
      service: 'code-server',
      origin,
      basePath: '/code-server/devbox',
      auth: 'code-server',
      password: 'password'
    });

  it('does not reuse target cache across revisions', async () => {
    fetchMock
      .mockResolvedValueOnce(targetResponse('https://gateway-one.example.com'))
      .mockResolvedValueOnce(targetResponse('https://gateway-two.example.com'));

    await expect(resolveProxyTarget('sandbox-1', 'code-server', 'rev-1')).resolves.toMatchObject({
      origin: 'https://gateway-one.example.com'
    });
    await expect(resolveProxyTarget('sandbox-1', 'code-server', 'rev-2')).resolves.toMatchObject({
      origin: 'https://gateway-two.example.com'
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
