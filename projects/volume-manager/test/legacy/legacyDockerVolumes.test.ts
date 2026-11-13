import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VolumeOwnershipError } from '../../src/drivers/IVolumeDriver';
import { LegacyVolumeForbiddenPrefixError } from '../../src/legacy/env';
import { LegacyDockerVolumeCleaner } from '../../src/legacy/legacyDockerVolumes';

describe('LegacyDockerVolumeCleaner', () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === 'http://localhost/version') {
          return new Response(JSON.stringify({ ApiVersion: '1.56', MinAPIVersion: '1.40' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'Api-Version': '1.56' }
          });
        }
        return fetchMock(input, init);
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects non-whitelisted prefixes such as database volumes with LegacyVolumeForbiddenPrefixError', async () => {
    const cleaner = new LegacyDockerVolumeCleaner();

    await expect(cleaner.exists('fastgpt-mongo')).rejects.toBeInstanceOf(
      LegacyVolumeForbiddenPrefixError
    );
    await expect(cleaner.remove('fastgpt-pg-data')).rejects.toBeInstanceOf(
      LegacyVolumeForbiddenPrefixError
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('detects unlabeled legacy local volumes and treats 404 as absent/idempotent', async () => {
    const cleaner = new LegacyDockerVolumeCleaner();

    fetchMock.mockResolvedValueOnce(new Response('', { status: 404 }));
    await expect(cleaner.exists('fastgpt-session-app-legacy1')).resolves.toBe(false);

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          Name: 'fastgpt-session-app-legacy1',
          Labels: null,
          Options: null,
          Mountpoint: '/var/lib/docker/volumes/fastgpt-session-app-legacy1/_data'
        }),
        { status: 200 }
      )
    );
    await expect(cleaner.exists('fastgpt-session-app-legacy1')).resolves.toBe(true);

    // 404 remove is idempotent
    fetchMock.mockResolvedValueOnce(new Response('', { status: 404 }));
    await expect(cleaner.remove('fastgpt-session-app-legacy1')).resolves.toBeUndefined();
  });

  it('refuses to inspect or delete v3-managed JuiceFS Docker volumes (labels or mountRoot path)', async () => {
    const cleaner = new LegacyDockerVolumeCleaner();

    // Case 1: v3 ownership labels
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          Name: 'fastgpt-session-app-v3-12345678',
          Labels: {
            app: 'fastgpt',
            'fastgpt.deployment': '0123456789abcdef0123456789abcdef'
          }
        }),
        { status: 200 }
      )
    );
    await expect(cleaner.remove('fastgpt-session-app-v3-12345678')).rejects.toBeInstanceOf(
      VolumeOwnershipError
    );

    // Case 2: bind mount pointing under /var/lib/fastgpt/sandbox-mounts
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          Name: 'fastgpt-session-app-v3-bind',
          Labels: {},
          Options: {
            type: 'none',
            o: 'bind',
            device: '/var/lib/fastgpt/sandbox-mounts/fastgpt-session-app-v3-bind'
          }
        }),
        { status: 200 }
      )
    );
    await expect(cleaner.exists('fastgpt-session-app-v3-bind')).rejects.toBeInstanceOf(
      VolumeOwnershipError
    );
  });

  it('blocks deletion when container still references legacy volume and deletes cleanly when unreferenced', async () => {
    const cleaner = new LegacyDockerVolumeCleaner();
    const inspectBody = JSON.stringify({
      Name: 'fastgpt-session-legacy-vol',
      Labels: {},
      Options: null,
      Mountpoint: '/var/lib/docker/volumes/fastgpt-session-legacy-vol/_data'
    });

    // Referenced by container -> error
    fetchMock
      .mockResolvedValueOnce(new Response(inspectBody, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ Id: 'container-1' }]), { status: 200 })
      );
    await expect(cleaner.remove('fastgpt-session-legacy-vol')).rejects.toThrow(
      'still referenced by a container'
    );

    // Unreferenced -> DELETE /volumes/:name
    fetchMock
      .mockResolvedValueOnce(new Response(inspectBody, { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(cleaner.remove('fastgpt-session-legacy-vol')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenLastCalledWith(
      'http://localhost/v1.44/volumes/fastgpt-session-legacy-vol',
      expect.objectContaining({ method: 'DELETE' })
    );
  });
});
