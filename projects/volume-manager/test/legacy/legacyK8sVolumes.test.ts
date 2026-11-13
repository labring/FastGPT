import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VolumeOwnershipError } from '../../src/drivers/IVolumeDriver';
import { LegacyVolumeForbiddenPrefixError } from '../../src/legacy/env';
import { LegacyK8sVolumeCleaner } from '../../src/legacy/legacyK8sVolumes';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn((path: string) => {
    if (path.endsWith('ca.crt')) return 'mock-ca-cert';
    return 'mock-sa-token';
  })
}));

describe('LegacyK8sVolumeCleaner', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects non-sandbox PVC names before calling K8s API', async () => {
    const cleaner = new LegacyK8sVolumeCleaner({ namespace: 'opensandbox', pollIntervalMs: 1 });

    await expect(cleaner.exists('fastgpt-mongo-0')).rejects.toBeInstanceOf(
      LegacyVolumeForbiddenPrefixError
    );
    await expect(cleaner.remove('fastgpt-minio')).rejects.toBeInstanceOf(
      LegacyVolumeForbiddenPrefixError
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('detects active unlabeled legacy PVCs, ignores Terminating/404, and rejects v3-labeled PVCs', async () => {
    const cleaner = new LegacyK8sVolumeCleaner({ namespace: 'opensandbox', pollIntervalMs: 1 });

    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, text: async () => '' });
    await expect(cleaner.exists('fastgpt-session-legacy-1')).resolves.toBe(false);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        metadata: { uid: 'uid-legacy-1', deletionTimestamp: '2026-11-11T00:00:00Z' }
      })
    });
    await expect(cleaner.exists('fastgpt-session-legacy-1')).resolves.toBe(false);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ metadata: { uid: 'uid-legacy-2' } })
    });
    await expect(cleaner.exists('fastgpt-session-legacy-1')).resolves.toBe(true);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        metadata: {
          uid: 'uid-v3',
          labels: {
            app: 'fastgpt',
            'managed-by': 'fastgpt-volume-manager',
            'fastgpt.deployment': '0123456789abcdef0123456789abcdef'
          }
        }
      })
    });
    await expect(cleaner.remove('fastgpt-session-v3-pvc')).rejects.toBeInstanceOf(
      VolumeOwnershipError
    );
  });

  it('deletes unlabeled legacy PVC with UID precondition and waits until absent', async () => {
    const cleaner = new LegacyK8sVolumeCleaner({ namespace: 'opensandbox', pollIntervalMs: 1 });

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ metadata: { uid: 'uid-legacy-del' } })
      })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: false, status: 404, text: async () => '' });

    await expect(cleaner.remove('fastgpt-session-legacy-del')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://kubernetes.default.svc/api/v1/namespaces/opensandbox/persistentvolumeclaims/fastgpt-session-legacy-del',
      expect.objectContaining({
        method: 'DELETE',
        body: JSON.stringify({
          apiVersion: 'v1',
          kind: 'DeleteOptions',
          preconditions: { uid: 'uid-legacy-del' }
        })
      })
    );
  });
});
