import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { serviceEnv } from '@fastgpt/service/env';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn()
}));

vi.stubGlobal('fetch', mocks.fetch);

import {
  checkMaxServerAvailable,
  initMaxServerStatus,
  refreshMaxServerStatus,
  resetMaxServerProbeCache
} from '@fastgpt/service/common/system/maxServer';

describe('checkMaxServerAvailable', () => {
  const originalMaxUrl = serviceEnv.MAX_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    resetMaxServerProbeCache();
    Reflect.set(serviceEnv, 'MAX_URL', undefined);
  });

  afterEach(() => {
    Reflect.set(serviceEnv, 'MAX_URL', originalMaxUrl);
    vi.restoreAllMocks();
  });

  it('returns false immediately when MAX_URL is not set without sending network requests', async () => {
    Reflect.set(serviceEnv, 'MAX_URL', undefined);
    const result = await checkMaxServerAvailable();
    expect(result).toBe(false);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('returns true when health check returns 200 ok', async () => {
    Reflect.set(serviceEnv, 'MAX_URL', 'http://127.0.0.1:3002');
    mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ code: 200 }), { status: 200 }));

    const result = await checkMaxServerAvailable();
    expect(result).toBe(true);
    expect(mocks.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:3002/healthz',
      expect.objectContaining({
        signal: expect.any(AbortSignal)
      })
    );
  });

  it('caches probe success and does not re-fetch within TTL', async () => {
    Reflect.set(serviceEnv, 'MAX_URL', 'http://127.0.0.1:3002');
    mocks.fetch.mockResolvedValueOnce(new Response(null, { status: 200 }));

    const res1 = await checkMaxServerAvailable();
    expect(res1).toBe(true);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);

    const res2 = await checkMaxServerAvailable();
    expect(res2).toBe(true);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it('bypasses cache when force is true', async () => {
    Reflect.set(serviceEnv, 'MAX_URL', 'http://127.0.0.1:3002');
    mocks.fetch
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }));

    const res1 = await checkMaxServerAvailable();
    expect(res1).toBe(true);

    const res2 = await checkMaxServerAvailable(true);
    expect(res2).toBe(false);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it('returns false when fetch rejects with network error', async () => {
    Reflect.set(serviceEnv, 'MAX_URL', 'http://127.0.0.1:3002');
    mocks.fetch.mockRejectedValueOnce(new Error('fetch failed'));

    const result = await checkMaxServerAvailable();
    expect(result).toBe(false);
  });

  it('returns false when health check returns non-200 status', async () => {
    Reflect.set(serviceEnv, 'MAX_URL', 'http://127.0.0.1:3002');
    mocks.fetch.mockResolvedValueOnce(new Response(null, { status: 502 }));

    const result = await checkMaxServerAvailable();
    expect(result).toBe(false);
  });

  it('deduplicates concurrent in-flight requests', async () => {
    Reflect.set(serviceEnv, 'MAX_URL', 'http://127.0.0.1:3002');
    mocks.fetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(new Response(null, { status: 200 })), 20);
        })
    );

    const [res1, res2] = await Promise.all([checkMaxServerAvailable(), checkMaxServerAvailable()]);

    expect(res1).toBe(true);
    expect(res2).toBe(true);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('initMaxServerStatus', () => {
  const originalMaxUrl = serviceEnv.MAX_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    resetMaxServerProbeCache();
    Reflect.set(serviceEnv, 'MAX_URL', undefined);
    global.hasMax = undefined;
  });

  afterEach(() => {
    Reflect.set(serviceEnv, 'MAX_URL', originalMaxUrl);
    global.hasMax = undefined;
    vi.restoreAllMocks();
  });

  it('sets global.hasMax to false when Max server is not configured or unavailable', async () => {
    Reflect.set(serviceEnv, 'MAX_URL', undefined);
    const result = await initMaxServerStatus();

    expect(result).toBe(false);
    expect(global.hasMax).toBe(false);
  });

  it('sets global.hasMax to true when Max server probe succeeds', async () => {
    Reflect.set(serviceEnv, 'MAX_URL', 'http://127.0.0.1:3002');
    mocks.fetch.mockResolvedValueOnce(new Response(null, { status: 200 }));

    const result = await initMaxServerStatus();

    expect(result).toBe(true);
    expect(global.hasMax).toBe(true);
  });
});

describe('refreshMaxServerStatus', () => {
  const originalMaxUrl = serviceEnv.MAX_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    resetMaxServerProbeCache();
    Reflect.set(serviceEnv, 'MAX_URL', undefined);
    global.hasMax = undefined;
    global.feConfigs = {} as any;
  });

  afterEach(() => {
    Reflect.set(serviceEnv, 'MAX_URL', originalMaxUrl);
    global.hasMax = undefined;
    global.feConfigs = undefined as any;
    vi.restoreAllMocks();
  });

  it('updates global.hasMax and global.feConfigs.hasMax when Max becomes available', async () => {
    Reflect.set(serviceEnv, 'MAX_URL', 'http://127.0.0.1:3002');
    mocks.fetch.mockResolvedValueOnce(new Response(null, { status: 200 }));

    const result = await refreshMaxServerStatus();
    expect(result).toBe(true);
    expect(global.hasMax).toBe(true);
    expect(global.feConfigs.hasMax).toBe(true);
  });

  it('updates global.hasMax and global.feConfigs.hasMax to false when Max is down', async () => {
    global.hasMax = true;
    global.feConfigs.hasMax = true;
    Reflect.set(serviceEnv, 'MAX_URL', undefined);

    const result = await refreshMaxServerStatus();
    expect(result).toBe(false);
    expect(global.hasMax).toBe(false);
    expect(global.feConfigs.hasMax).toBe(false);
  });
});
