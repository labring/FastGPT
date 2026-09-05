import { beforeEach, describe, expect, it, vi } from 'vitest';

const volumeConfigMock = vi.hoisted(() => ({
  config: {
    enable: true,
    url: 'http://volume-manager.local',
    token: 'volume-token',
    volumeNamePrefix: 'fastgpt-session',
    storageSize: '1Gi'
  }
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/volume/config', () => ({
  getVolumeManagerEnvConfig: () => volumeConfigMock.config
}));

import {
  buildVolumeConfig,
  createLegacySessionVolumeClaimName,
  createSessionVolumeClaimName,
  deleteSessionVolume,
  ensureSessionVolume,
  getSessionVolumeClaimName,
  getSessionVolumeConfig
} from '@fastgpt/service/core/ai/sandbox/infrastructure/volume/service';

describe('sandbox volume service', () => {
  it('skips volume-manager entirely when disabled', async () => {
    volumeConfigMock.config = { ...volumeConfigMock.config, enable: false };
    const fetchMock = vi.fn(async () => {
      throw new Error('volume-manager must not be called when disabled');
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(getSessionVolumeConfig('claim-1')).resolves.toBeUndefined();
    await expect(deleteSessionVolume('claim-1')).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  beforeEach(() => {
    vi.unstubAllGlobals();
    volumeConfigMock.config = {
      enable: true,
      url: 'http://volume-manager.local',
      token: 'volume-token',
      volumeNamePrefix: 'fastgpt-session',
      storageSize: '1Gi'
    };
  });

  it('builds provider volume config and persisted storage metadata', () => {
    expect(buildVolumeConfig('claim-1')).toEqual({
      volumes: [
        {
          name: 'workspace',
          pvc: {
            claimName: 'claim-1',
            createIfNotExists: false,
            deleteOnSandboxTermination: false
          },
          mountPath: '/workspace'
        }
      ],
      storage: {
        volumes: [{ name: 'workspace', claimName: 'claim-1', mountPath: '/workspace' }],
        mountPath: '/workspace'
      }
    });
  });

  it('generates a claimName and reads it from storage', () => {
    const claimName = createSessionVolumeClaimName({
      sandboxId: 'ABC123',
      generationId: 'generation1'
    });

    expect(claimName).toBe('fastgpt-session-abc123-generation1');
    expect(getSessionVolumeClaimName(buildVolumeConfig(claimName).storage)).toBe(claimName);
  });

  it('generates a short prefixed claimName when no generation is provided', () => {
    const claimName = createSessionVolumeClaimName({ sandboxId: 'ABC123' });

    expect(claimName).toMatch(/^fastgpt-session-abc123-[a-f0-9]{8}$/);
  });

  it('uses the app-configured volume name prefix', () => {
    volumeConfigMock.config.volumeNamePrefix = 'custom-volume';

    expect(createSessionVolumeClaimName({ sandboxId: 'ABC123', generationId: 'generation1' })).toBe(
      'custom-volume-abc123-generation1'
    );
  });

  it('reconstructs the pre-generation deterministic volume name', () => {
    volumeConfigMock.config.volumeNamePrefix = 'legacy-prefix';

    expect(createLegacySessionVolumeClaimName('ABC123')).toBe('legacy-prefix-abc123');
  });

  it('ensures an exact claimName with auth header', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ claimName: 'claim-1', created: true })
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(ensureSessionVolume('claim-1')).resolves.toBe('claim-1');
    expect(fetchMock).toHaveBeenCalledWith('http://volume-manager.local/v1/volumes/ensure', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer volume-token'
      },
      body: JSON.stringify({ claimName: 'claim-1', storageSize: '1Gi' })
    });
  });

  it('omits auth header when volume-manager token is not configured', async () => {
    volumeConfigMock.config.token = '';
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 204,
      json: async () => ({ claimName: 'claim-1', created: true }),
      text: async () => ''
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(ensureSessionVolume('claim-1')).resolves.toBe('claim-1');
    await expect(deleteSessionVolume('fastgpt-session-claim-1')).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://volume-manager.local/v1/volumes/ensure',
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ claimName: 'claim-1', storageSize: '1Gi' })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://volume-manager.local/v1/volumes/fastgpt-session-claim-1',
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

    await expect(ensureSessionVolume('claim-1')).rejects.toThrow('volume-manager error: 500 boom');
  });

  it('deletes session volume and treats disabled or 404 as success', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 204, text: async () => '' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(deleteSessionVolume('fastgpt-session-a')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://volume-manager.local/v1/volumes/fastgpt-session-a',
      {
        method: 'DELETE',
        headers: { Authorization: 'Bearer volume-token' }
      }
    );

    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, text: async () => 'not found' });
    await expect(deleteSessionVolume('fastgpt-session-missing')).resolves.toBeUndefined();

    volumeConfigMock.config.volumeNamePrefix = 'new-prefix';
    fetchMock.mockResolvedValueOnce({ ok: true, status: 204, text: async () => '' });
    await expect(deleteSessionVolume('legacy-prefix-a')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenLastCalledWith(
      'http://volume-manager.local/v1/volumes/legacy-prefix-a',
      {
        method: 'DELETE',
        headers: { Authorization: 'Bearer volume-token' }
      }
    );

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

    await expect(deleteSessionVolume('fastgpt-session-claim-1')).rejects.toThrow(
      'volume-manager error: 503 unavailable'
    );
  });

  it('returns undefined when session volume is disabled', async () => {
    volumeConfigMock.config.enable = false;

    await expect(getSessionVolumeConfig('claim-1')).resolves.toBeUndefined();
  });

  it('requires volume-manager url when enabled', async () => {
    volumeConfigMock.config.url = '';

    await expect(getSessionVolumeConfig('claim-1')).rejects.toThrow(
      'AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_URL is required'
    );
  });

  it('returns session volume config when enabled', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ claimName: 'claim-1', created: false })
      }))
    );

    await expect(getSessionVolumeConfig('claim-1')).resolves.toEqual(buildVolumeConfig('claim-1'));
  });

  it('rejects a different claimName returned by volume-manager', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ claimName: 'other-claim', created: false })
      }))
    );

    await expect(ensureSessionVolume('claim-1')).rejects.toThrow(
      'expected claim-1, received other-claim'
    );
  });
});
