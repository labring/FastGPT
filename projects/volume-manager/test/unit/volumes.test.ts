import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createVolumeManagerApp, verifyBearerAuthHeader } from '../../src/index';
import { VolumeOwnershipError, type IVolumeDriver } from '../../src/drivers/IVolumeDriver';

const AUTH_TOKEN = 'secret-volume-token';
const AUTH_HEADERS = { Authorization: `Bearer ${AUTH_TOKEN}` };
const DEPLOYMENT_ID = '0123456789abcdef0123456789abcdef';
const CLAIM_NAME = 'fastgpt-session-a1b2c3d4e5f6a1b2c3d4e5f6-generation';

describe('createVolumeManagerApp & /v1/volumes routes', () => {
  let driver: IVolumeDriver;
  let app: ReturnType<typeof createVolumeManagerApp>;

  beforeEach(() => {
    driver = {
      ensure: vi.fn(),
      unmount: vi.fn(),
      remove: vi.fn(),
      list: vi.fn(async () => [])
    };
    app = createVolumeManagerApp({ driver, authToken: AUTH_TOKEN });
  });

  it('verifies Bearer tokens in constant time regardless of token length', () => {
    expect(verifyBearerAuthHeader(undefined, 'secret-token')).toBe(false);
    expect(verifyBearerAuthHeader('secret-token', 'secret-token')).toBe(false);
    expect(verifyBearerAuthHeader('Bearer wrong', 'secret-token')).toBe(false);
    expect(verifyBearerAuthHeader('Bearer wrong-same-l', 'secret-token')).toBe(false);
    expect(verifyBearerAuthHeader('Bearer ', '')).toBe(false);
    expect(verifyBearerAuthHeader('Bearer secret-token', 'secret-token')).toBe(true);
  });

  it('serves /health unauthenticated and enforces Bearer auth on /v1/*', async () => {
    const healthRes = await app.request('/health');
    expect(healthRes.status).toBe(200);
    await expect(healthRes.json()).resolves.toEqual({ status: 'ok' });

    const unauthRes = await app.request(`/v1/volumes?deploymentId=${DEPLOYMENT_ID}`);
    expect(unauthRes.status).toBe(401);
  });

  it('validates deploymentId and claimName across GET, POST /ensure, POST /unmount, and DELETE', async () => {
    for (const badQuery of ['', '?deploymentId=invalid', `?deploymentId=${'A'.repeat(32)}`]) {
      expect((await app.request(`/v1/volumes${badQuery}`, { headers: AUTH_HEADERS })).status).toBe(
        400
      );
      expect(
        (
          await app.request(`/v1/volumes/${CLAIM_NAME}${badQuery}`, {
            method: 'DELETE',
            headers: AUTH_HEADERS
          })
        ).status
      ).toBe(400);
      expect(
        (
          await app.request(`/v1/volumes/${CLAIM_NAME}/unmount${badQuery}`, {
            method: 'POST',
            headers: AUTH_HEADERS
          })
        ).status
      ).toBe(400);
    }

    expect(
      (
        await app.request('/v1/volumes/ensure', {
          method: 'POST',
          headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
          body: JSON.stringify({ claimName: CLAIM_NAME, deploymentId: 'invalid' })
        })
      ).status
    ).toBe(400);

    expect(
      (
        await app.request(`/v1/volumes/INVALID_CLAIM?deploymentId=${DEPLOYMENT_ID}`, {
          method: 'DELETE',
          headers: AUTH_HEADERS
        })
      ).status
    ).toBe(400);

    expect(driver.list).not.toHaveBeenCalled();
    expect(driver.ensure).not.toHaveBeenCalled();
    expect(driver.remove).not.toHaveBeenCalled();
    expect(driver.unmount).not.toHaveBeenCalled();
  });

  it('dispatches valid list, ensure (201/200), unmount (204), and remove (204) operations', async () => {
    vi.mocked(driver.list).mockResolvedValue([CLAIM_NAME]);
    const listRes = await app.request(`/v1/volumes?deploymentId=${DEPLOYMENT_ID}`, {
      headers: AUTH_HEADERS
    });
    expect(listRes.status).toBe(200);
    await expect(listRes.json()).resolves.toEqual({ items: [CLAIM_NAME] });

    vi.mocked(driver.ensure).mockResolvedValueOnce({ claimName: CLAIM_NAME, created: true });
    const ensureRes = await app.request('/v1/volumes/ensure', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        claimName: CLAIM_NAME,
        deploymentId: DEPLOYMENT_ID,
        storageSize: '5Gi'
      })
    });
    expect(ensureRes.status).toBe(201);
    expect(driver.ensure).toHaveBeenCalledWith({
      claimName: CLAIM_NAME,
      deploymentId: DEPLOYMENT_ID,
      storageSize: '5Gi'
    });

    const unmountRes = await app.request(
      `/v1/volumes/${CLAIM_NAME}/unmount?deploymentId=${DEPLOYMENT_ID}`,
      { method: 'POST', headers: AUTH_HEADERS }
    );
    expect(unmountRes.status).toBe(204);
    expect(driver.unmount).toHaveBeenCalledWith(CLAIM_NAME, DEPLOYMENT_ID);

    const delRes = await app.request(`/v1/volumes/${CLAIM_NAME}?deploymentId=${DEPLOYMENT_ID}`, {
      method: 'DELETE',
      headers: AUTH_HEADERS
    });
    expect(delRes.status).toBe(204);
    expect(driver.remove).toHaveBeenCalledWith(CLAIM_NAME, DEPLOYMENT_ID);
  });

  it('maps VolumeOwnershipError to 409 and unexpected errors to 500 centrally', async () => {
    vi.mocked(driver.ensure).mockRejectedValueOnce(new VolumeOwnershipError('not owned'));
    const conflictRes = await app.request('/v1/volumes/ensure', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ claimName: CLAIM_NAME, deploymentId: DEPLOYMENT_ID })
    });
    expect(conflictRes.status).toBe(409);
    await expect(conflictRes.json()).resolves.toEqual({ error: 'not owned' });

    vi.mocked(driver.list).mockRejectedValueOnce(new Error('backend crash'));
    const crashRes = await app.request(`/v1/volumes?deploymentId=${DEPLOYMENT_ID}`, {
      headers: AUTH_HEADERS
    });
    expect(crashRes.status).toBe(500);
    await expect(crashRes.json()).resolves.toEqual({ error: 'Internal server error' });
  });
});
