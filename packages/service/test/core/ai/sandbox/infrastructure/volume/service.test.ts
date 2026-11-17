import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import {
  createDefaultInstanceConfig,
  getTestInstanceConfig
} from '@test/utils/instanceConfigSnapshot';

const volumeConfigMock = vi.hoisted(() => ({
  readLive: false,
  config: {
    enable: true,
    url: 'http://volume-manager.local',
    token: 'volume-token',
    volumeNamePrefix: 'fastgpt-session',
    storageSize: '1Gi'
  }
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/volume/config', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@fastgpt/service/core/ai/sandbox/infrastructure/volume/config')
    >();
  return {
    getVolumeManagerEnvConfig: () =>
      volumeConfigMock.readLive ? actual.getVolumeManagerEnvConfig() : volumeConfigMock.config
  };
});

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

  it('sends live storage size and credentials to the volume-manager HTTP boundary', async () => {
    const requests: Array<{ method?: string; path?: string; token?: string; body: any }> = [];
    const server = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;
      requests.push({ method: req.method, path: req.url, token: req.headers.authorization, body });
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(body ? { claimName: body.claimName, created: false } : {}));
    });
    const original = global.systemInstanceConfig;
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string')
        throw new Error('Missing volume fixture address');
      global.systemInstanceConfig = createDefaultInstanceConfig();
      volumeConfigMock.readLive = true;
      const config = getTestInstanceConfig().subservice.agentSandbox;
      config.opensandbox.volumeManagerUrl = `http://127.0.0.1:${address.port}`;
      for (const size of [2, 5]) {
        config.common.storageSizeGi = size;
        config.opensandbox.volumeManagerToken = `synthetic-${size}`;
        config.opensandbox.volumeNamePrefix = `owned-${size}`;
        const claim = createSessionVolumeClaimName({
          sandboxId: 'abc123',
          generationId: 'generation1'
        });
        expect(claim).toBe(`owned-${size}-abc123-generation1`);
        await expect(getSessionVolumeConfig(claim)).resolves.toMatchObject({
          storage: { volumes: [{ claimName: claim }] }
        });
        await deleteSessionVolume(claim);
        expect(requests.slice(-2)).toEqual([
          {
            method: 'POST',
            path: '/v1/volumes/ensure',
            token: `Bearer synthetic-${size}`,
            body: { claimName: claim, storageSize: `${size}Gi` }
          },
          {
            method: 'DELETE',
            path: `/v1/volumes/${claim}`,
            token: `Bearer synthetic-${size}`,
            body: undefined
          }
        ]);
      }
    } finally {
      volumeConfigMock.readLive = false;
      global.systemInstanceConfig = original;
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    }
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
