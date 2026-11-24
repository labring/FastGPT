import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn()
}));

vi.mock('../../src/env', () => ({
  env: {
    PORT: 3000,
    VM_AUTH_TOKEN: 'secret-token',
    VM_RUNTIME: 'kubernetes',
    VM_DOCKER_SOCKET: '/var/run/docker.sock',
    VM_DOCKER_API_VERSION: 'v1.44',
    VM_K8S_NAMESPACE: 'opensandbox',
    VM_K8S_PVC_STORAGE_CLASS: ''
  }
}));

vi.mock('../../src/utils/logger', () => ({
  LogCategories: {
    MODULE: {
      VOLUME_MANAGER: {
        SERVER: ['volume-manager', 'server'] as const,
        API: ['volume-manager', 'api'] as const,
        DRIVER: ['volume-manager', 'driver'] as const
      }
    }
  },
  configureLogger: vi.fn(),
  disposeLogger: vi.fn(),
  getLogger: () => mockLogger
}));

import { createVolumeManagerApp } from '../../src/index';
import type { IVolumeDriver } from '../../src/drivers/IVolumeDriver';

const CLAIM_NAME = 'fastgpt-session-a1b2c3d4e5f6a1b2c3d4e5f6-generation';
const AUTH_HEADERS = { Authorization: 'Bearer secret-token' };

describe('volume-manager HTTP routes', () => {
  let driver: IVolumeDriver;
  let app: ReturnType<typeof createVolumeManagerApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    driver = {
      exists: vi.fn(),
      ensure: vi.fn(),
      remove: vi.fn(),
      list: vi.fn()
    };
    app = createVolumeManagerApp(driver, 'secret-token');
  });

  it('allows /health without auth and enforces bearer auth on /v1/*', async () => {
    const healthRes = await app.request('/health');
    expect(healthRes.status).toBe(200);

    const unauthRes = await app.request('/v1/volumes');
    expect(unauthRes.status).toBe(401);
  });

  it('GET /v1/volumes returns items', async () => {
    vi.mocked(driver.list).mockResolvedValueOnce([CLAIM_NAME]);
    const okRes = await app.request('/v1/volumes', {
      headers: AUTH_HEADERS
    });
    expect(okRes.status).toBe(200);
    await expect(okRes.json()).resolves.toEqual({ items: [CLAIM_NAME] });
    expect(driver.list).toHaveBeenCalledWith();
  });

  it('GET /v1/volumes/:claimName validates params and returns 200 or 404 without creating', async () => {
    const badNameRes = await app.request('/v1/volumes/INVALID_NAME', {
      headers: AUTH_HEADERS
    });
    expect(badNameRes.status).toBe(400);

    vi.mocked(driver.exists).mockResolvedValueOnce(false);
    const missingRes = await app.request(`/v1/volumes/${CLAIM_NAME}`, {
      headers: AUTH_HEADERS
    });
    expect(missingRes.status).toBe(404);
    expect(driver.exists).toHaveBeenCalledWith(CLAIM_NAME);

    vi.mocked(driver.exists).mockResolvedValueOnce(true);
    const legacyOkRes = await app.request(`/v1/volumes/${CLAIM_NAME}?allowLegacyUnlabeled=true`, {
      headers: AUTH_HEADERS
    });
    expect(legacyOkRes.status).toBe(200);
    await expect(legacyOkRes.json()).resolves.toEqual({ claimName: CLAIM_NAME });
    expect(driver.exists).toHaveBeenLastCalledWith(CLAIM_NAME, { allowLegacyUnlabeled: true });
    expect(driver.ensure).not.toHaveBeenCalled();
  });

  it('POST /v1/volumes/ensure forwards claimName and storageSize', async () => {
    vi.mocked(driver.ensure).mockResolvedValueOnce({ claimName: CLAIM_NAME, created: true });
    const createRes = await app.request('/v1/volumes/ensure', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ claimName: CLAIM_NAME, storageSize: '2Gi' })
    });
    expect(createRes.status).toBe(201);
    expect(driver.ensure).toHaveBeenCalledWith({
      claimName: CLAIM_NAME,
      storageSize: '2Gi'
    });
  });

  it('DELETE /v1/volumes/:claimName validates params and deletes volume', async () => {
    const badNameRes = await app.request('/v1/volumes/INVALID_NAME', {
      method: 'DELETE',
      headers: AUTH_HEADERS
    });
    expect(badNameRes.status).toBe(400);

    vi.mocked(driver.remove).mockResolvedValueOnce(undefined);
    const okRes = await app.request(`/v1/volumes/${CLAIM_NAME}`, {
      method: 'DELETE',
      headers: AUTH_HEADERS
    });
    expect(okRes.status).toBe(204);
    expect(driver.remove).toHaveBeenCalledWith(CLAIM_NAME);

    vi.mocked(driver.remove).mockResolvedValueOnce(undefined);
    const legacyDeleteRes = await app.request(
      `/v1/volumes/${CLAIM_NAME}?allowLegacyUnlabeled=true`,
      {
        method: 'DELETE',
        headers: AUTH_HEADERS
      }
    );
    expect(legacyDeleteRes.status).toBe(204);
    expect(driver.remove).toHaveBeenLastCalledWith(CLAIM_NAME, { allowLegacyUnlabeled: true });
  });

  it('maps typed driver HTTP errors to 403/409/504 and rejects wrong bearer tokens', async () => {
    const { HTTPException } = await import('hono/http-exception');

    const wrongTokenRes = await app.request('/v1/volumes', {
      headers: { Authorization: 'Bearer wrong-token!' }
    });
    expect(wrongTokenRes.status).toBe(401);

    for (const [status, message, run] of [
      [
        403,
        'forbidden label',
        () => {
          vi.mocked(driver.exists).mockRejectedValueOnce(
            new HTTPException(403, { message: 'forbidden label' })
          );
          return app.request(`/v1/volumes/${CLAIM_NAME}`, { headers: AUTH_HEADERS });
        }
      ],
      [
        409,
        'delete conflict',
        () => {
          vi.mocked(driver.remove).mockRejectedValueOnce(
            new HTTPException(409, { message: 'delete conflict' })
          );
          return app.request(`/v1/volumes/${CLAIM_NAME}`, {
            method: 'DELETE',
            headers: AUTH_HEADERS
          });
        }
      ],
      [
        504,
        'timed out',
        () => {
          vi.mocked(driver.ensure).mockRejectedValueOnce(
            new HTTPException(504, { message: 'timed out' })
          );
          return app.request('/v1/volumes/ensure', {
            method: 'POST',
            headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
            body: JSON.stringify({ claimName: CLAIM_NAME })
          });
        }
      ]
    ] as const) {
      const res = await run();
      expect(res.status, message).toBe(status);
    }

    vi.mocked(driver.list).mockRejectedValueOnce(new DOMException('aborted', 'TimeoutError'));
    const abortTimeoutRes = await app.request('/v1/volumes', {
      headers: AUTH_HEADERS
    });
    expect(abortTimeoutRes.status).toBe(504);
  });

  it('logs expected 4xx HTTPException at warn level and 5xx/unexpected errors at error level', async () => {
    const { HTTPException } = await import('hono/http-exception');

    vi.mocked(driver.exists).mockRejectedValueOnce(
      new HTTPException(403, { message: 'forbidden label' })
    );
    const res403 = await app.request(`/v1/volumes/${CLAIM_NAME}`, { headers: AUTH_HEADERS });
    expect(res403.status).toBe(403);
    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn).toHaveBeenCalledWith('Request rejected', {
      status: 403,
      method: 'GET',
      path: `/v1/volumes/${CLAIM_NAME}`,
      message: 'forbidden label'
    });
    expect(mockLogger.error).not.toHaveBeenCalled();

    mockLogger.warn.mockClear();
    vi.mocked(driver.remove).mockRejectedValueOnce(
      new HTTPException(409, { message: 'delete conflict' })
    );
    const res409 = await app.request(`/v1/volumes/${CLAIM_NAME}`, {
      method: 'DELETE',
      headers: AUTH_HEADERS
    });
    expect(res409.status).toBe(409);
    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn).toHaveBeenCalledWith('Request rejected', {
      status: 409,
      method: 'DELETE',
      path: `/v1/volumes/${CLAIM_NAME}`,
      message: 'delete conflict'
    });
    expect(mockLogger.error).not.toHaveBeenCalled();

    mockLogger.warn.mockClear();
    const timeoutErr = new HTTPException(504, { message: 'timed out' });
    vi.mocked(driver.ensure).mockRejectedValueOnce(timeoutErr);
    const res504 = await app.request('/v1/volumes/ensure', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ claimName: CLAIM_NAME })
    });
    expect(res504.status).toBe(504);
    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    expect(mockLogger.error).toHaveBeenCalledWith('Upstream or server error', {
      status: 504,
      method: 'POST',
      path: '/v1/volumes/ensure',
      error: timeoutErr
    });
    expect(mockLogger.warn).not.toHaveBeenCalled();

    mockLogger.error.mockClear();
    const unexpectedErr = new Error('unexpected failure');
    vi.mocked(driver.list).mockRejectedValueOnce(unexpectedErr);
    const res500 = await app.request('/v1/volumes', { headers: AUTH_HEADERS });
    expect(res500.status).toBe(500);
    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    expect(mockLogger.error).toHaveBeenCalledWith('Unhandled request error', {
      method: 'GET',
      path: '/v1/volumes',
      error: unexpectedErr
    });
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });
});
