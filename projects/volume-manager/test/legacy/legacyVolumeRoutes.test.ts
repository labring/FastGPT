import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VolumeOwnershipError, type IVolumeDriver } from '../../src/drivers/IVolumeDriver';
import { createVolumeManagerApp } from '../../src/index';
import {
  getLegacyAllowedVolumePrefixes,
  LegacyVolumeForbiddenPrefixError,
  type ILegacyVolumeCleaner
} from '../../src/legacy/env';

const AUTH_TOKEN = 'secret-volume-token';
const AUTH_HEADERS = { Authorization: `Bearer ${AUTH_TOKEN}` };

describe('legacyVolumeRoutes via createVolumeManagerApp', () => {
  let cleaner: ILegacyVolumeCleaner;
  let app: ReturnType<typeof createVolumeManagerApp>;

  beforeEach(() => {
    cleaner = {
      exists: vi.fn(async () => true),
      remove: vi.fn(async () => undefined)
    };
    const dummyDriver: IVolumeDriver = {
      ensure: vi.fn(),
      unmount: vi.fn(),
      remove: vi.fn(),
      list: vi.fn(async () => [])
    };
    app = createVolumeManagerApp({
      driver: dummyDriver,
      authToken: AUTH_TOKEN,
      legacyCleaner: cleaner
    });
  });

  it('normalizes VM_LEGACY_VOLUME_PREFIXES with trailing hyphens', () => {
    expect(getLegacyAllowedVolumePrefixes(undefined)).toEqual(['fastgpt-session-']);
    expect(getLegacyAllowedVolumePrefixes('custom-sbx, fastgpt-session- ')).toEqual([
      'custom-sbx-',
      'fastgpt-session-'
    ]);
  });

  it('enforces Bearer auth and maps GET/DELETE statuses (200 / 400 / 403 / 409)', async () => {
    expect((await app.request('/v1/legacy-volumes/fastgpt-session-legacy-1')).status).toBe(401);

    expect(
      (await app.request('/v1/legacy-volumes/INVALID_NAME', { headers: AUTH_HEADERS })).status
    ).toBe(400);

    const getRes = await app.request('/v1/legacy-volumes/fastgpt-session-legacy-1', {
      headers: AUTH_HEADERS
    });
    expect(getRes.status).toBe(200);
    await expect(getRes.json()).resolves.toEqual({ exists: true });

    const delRes = await app.request('/v1/legacy-volumes/fastgpt-session-legacy-1', {
      method: 'DELETE',
      headers: AUTH_HEADERS
    });
    expect(delRes.status).toBe(200);
    await expect(delRes.json()).resolves.toEqual({ ok: true });

    vi.mocked(cleaner.remove).mockRejectedValueOnce(
      new LegacyVolumeForbiddenPrefixError('fastgpt-mongo')
    );
    expect(
      (
        await app.request('/v1/legacy-volumes/fastgpt-mongo', {
          method: 'DELETE',
          headers: AUTH_HEADERS
        })
      ).status
    ).toBe(403);

    vi.mocked(cleaner.remove).mockRejectedValueOnce(new VolumeOwnershipError('v3 managed volume'));
    expect(
      (
        await app.request('/v1/legacy-volumes/fastgpt-session-v3', {
          method: 'DELETE',
          headers: AUTH_HEADERS
        })
      ).status
    ).toBe(409);
  });
});
