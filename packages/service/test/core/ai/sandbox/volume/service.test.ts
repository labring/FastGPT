import { beforeEach, describe, expect, it, vi } from 'vitest';

const volumeConfigMock = vi.hoisted(() => ({
  config: {
    enable: true,
    url: 'http://volume-manager.local',
    token: 'volume-token'
  }
}));

vi.mock('@fastgpt/service/core/ai/sandbox/volume/config', () => ({
  getVolumeManagerEnvConfig: () => volumeConfigMock.config
}));

import {
  buildVolumeConfig,
  deleteSessionVolume,
  ensureSessionVolume,
  getSessionVolumeConfig
} from '@fastgpt/service/core/ai/sandbox/volume/service';

describe('sandbox volume service', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    volumeConfigMock.config = {
      enable: true,
      url: 'http://volume-manager.local',
      token: 'volume-token'
    };
  });

  it('builds provider volume config and persisted storage metadata', () => {
    expect(buildVolumeConfig('claim-1')).toEqual({
      volumes: [{ name: 'workspace', pvc: { claimName: 'claim-1' }, mountPath: '/workspace' }],
      storage: {
        volumes: [{ name: 'workspace', claimName: 'claim-1', mountPath: '/workspace' }],
        mountPath: '/workspace'
      }
    });
  });

  it('ensures session volume with auth header', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ claimName: 'claim-session-1' })
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(ensureSessionVolume('session-1')).resolves.toBe('claim-session-1');
    expect(fetchMock).toHaveBeenCalledWith('http://volume-manager.local/v1/volumes/ensure', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer volume-token'
      },
      body: JSON.stringify({ sessionId: 'session-1' })
    });
  });

  it('omits auth header when volume-manager token is not configured', async () => {
    volumeConfigMock.config.token = '';
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 204,
      json: async () => ({ claimName: 'claim-session-1' }),
      text: async () => ''
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(ensureSessionVolume('session-1')).resolves.toBe('claim-session-1');
    await expect(deleteSessionVolume('session-1')).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://volume-manager.local/v1/volumes/ensure',
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json'
        }
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://volume-manager.local/v1/volumes/session-1',
      expect.objectContaining({
        headers: {}
      })
    );
  });

  it('throws volume-manager response text on ensure failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 500,
        text: async () => 'boom'
      }))
    );

    await expect(ensureSessionVolume('session-1')).rejects.toThrow(
      'volume-manager error: 500 boom'
    );
  });

  it('deletes session volume and treats disabled or 404 as success', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 204, text: async () => '' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(deleteSessionVolume('session/a')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith('http://volume-manager.local/v1/volumes/session%2Fa', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer volume-token' }
    });

    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, text: async () => 'not found' });
    await expect(deleteSessionVolume('missing')).resolves.toBeUndefined();

    volumeConfigMock.config.enable = false;
    await expect(deleteSessionVolume('disabled')).resolves.toBeUndefined();
  });

  it('throws volume-manager response text on delete failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 503,
        text: async () => 'unavailable'
      }))
    );

    await expect(deleteSessionVolume('session-1')).rejects.toThrow(
      'volume-manager error: 503 unavailable'
    );
  });

  it('returns undefined when session volume is disabled', async () => {
    volumeConfigMock.config.enable = false;

    await expect(getSessionVolumeConfig('session-1')).resolves.toBeUndefined();
  });

  it('requires volume-manager url when enabled', async () => {
    volumeConfigMock.config.url = '';

    await expect(getSessionVolumeConfig('session-1')).rejects.toThrow(
      'AGENT_SANDBOX_VOLUME_MANAGER_URL is required'
    );
  });

  it('returns session volume config when enabled', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ claimName: 'claim-session-1' })
      }))
    );

    await expect(getSessionVolumeConfig('session-1')).resolves.toEqual(
      buildVolumeConfig('claim-session-1')
    );
  });
});
