import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDockerSocketClient, selectDockerApiVersion } from '../../src/utils/dockerApi';

describe('dockerApi version negotiation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('selects preferred 1.44 when supported, downgrades for older daemons, and upgrades when MinAPIVersion exceeds 1.44', () => {
    expect(selectDockerApiVersion({ serverApiVersion: '1.56', minApiVersion: '1.40' })).toBe(
      'v1.44'
    );
    expect(selectDockerApiVersion({ serverApiVersion: '1.44', minApiVersion: '1.24' })).toBe(
      'v1.44'
    );
    expect(selectDockerApiVersion({ serverApiVersion: '1.41', minApiVersion: '1.12' })).toBe(
      'v1.41'
    );
    expect(selectDockerApiVersion({ serverApiVersion: '1.60', minApiVersion: '1.50' })).toBe(
      'v1.50'
    );
  });

  it('negotiates once via GET /version, caches across concurrent/subsequent calls, and falls back to Api-Version header', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === 'http://localhost/version') {
        return new Response('{}', {
          status: 200,
          headers: { 'Api-Version': '1.41' }
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = createDockerSocketClient();
    const [res1, res2] = await Promise.all([
      client.fetch('/volumes/vol-1'),
      client.fetch('/volumes/vol-2')
    ]);
    const res3 = await client.fetch('/volumes');

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res3.status).toBe(200);

    const requestedUrls = fetchMock.mock.calls.map(([input]) => String(input));
    expect(requestedUrls.filter((u) => u === 'http://localhost/version')).toHaveLength(1);
    expect(requestedUrls).toContain('http://localhost/v1.41/volumes/vol-1');
    expect(requestedUrls).toContain('http://localhost/v1.41/volumes/vol-2');
    expect(requestedUrls).toContain('http://localhost/v1.41/volumes');
  });

  it('clears failed negotiation promise on HTTP or malformed /version responses so next call recovers', async () => {
    let versionCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === 'http://localhost/version') {
        versionCalls += 1;
        if (versionCalls === 1) {
          return new Response('daemon starting', { status: 503 });
        }
        if (versionCalls === 2) {
          return new Response(JSON.stringify({ ApiVersion: 'invalid' }), { status: 200 });
        }
        return new Response(JSON.stringify({ ApiVersion: '1.60', MinAPIVersion: '1.52' }), {
          status: 200
        });
      }
      return new Response('[]', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = createDockerSocketClient();
    await expect(client.fetch('/volumes')).rejects.toThrow(
      'Docker API version negotiation failed (503)'
    );
    await expect(client.fetch('/volumes')).rejects.toThrow(
      'Docker daemon /version response did not include a valid ApiVersion'
    );

    const recovered = await client.fetch('/volumes');
    expect(recovered.status).toBe(200);
    expect(fetchMock).toHaveBeenLastCalledWith(
      'http://localhost/v1.52/volumes',
      expect.objectContaining({ dispatcher: expect.anything() })
    );
  });
});
