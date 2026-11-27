import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const VOLUME_NAME = 'fastgpt-session-a1b2c3d4e5f6a1b2c3d4e5f6-generation';

vi.mock('../../src/env', () => ({
  env: {
    VM_K8S_NAMESPACE: 'opensandbox',
    VM_K8S_PVC_STORAGE_CLASS: ''
  }
}));

// Mock token and CA file reads
vi.mock('fs', () => ({
  readFileSync: vi.fn((path: string) => {
    if (path.endsWith('ca.crt')) return 'mock-ca-cert';
    return 'mock-token';
  })
}));

describe('K8sVolumeDriver', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  const pvcResponse = ({
    uid,
    deletionTimestamp,
    labels = {
      app: 'fastgpt',
      'managed-by': 'fastgpt-volume-manager'
    }
  }: {
    uid: string;
    deletionTimestamp?: string;
    labels?: Record<string, string> | null;
  }) => ({
    ok: true,
    status: 200,
    json: async () => ({
      metadata: {
        uid,
        ...(labels ? { labels } : {}),
        ...(deletionTimestamp ? { deletionTimestamp } : {})
      }
    })
  });
  const notFoundResponse = () => ({ ok: false, status: 404, text: async () => '' });
  const errorResponse = (status: number, message: string) => ({
    ok: false,
    status,
    text: async () => message
  });

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('exists inspects PVC without creating and treats absent/deleting as false', async () => {
    const { K8sVolumeDriver } = await import('../../src/drivers/K8sVolumeDriver');
    const driver = new K8sVolumeDriver();

    fetchMock.mockResolvedValueOnce(notFoundResponse());
    await expect(driver.exists(VOLUME_NAME)).resolves.toBe(false);

    fetchMock.mockResolvedValueOnce(
      pvcResponse({ uid: 'uid-deleting', deletionTimestamp: '2026-07-30T00:00:00Z' })
    );
    await expect(driver.exists(VOLUME_NAME)).resolves.toBe(false);

    fetchMock.mockResolvedValueOnce(pvcResponse({ uid: 'uid-active' }));
    await expect(driver.exists(VOLUME_NAME)).resolves.toBe(true);

    fetchMock.mockResolvedValueOnce(pvcResponse({ uid: 'uid-legacy', labels: null }));
    await expect(driver.exists(VOLUME_NAME)).rejects.toThrow(
      'missing fastgpt-volume-manager ownership labels'
    );

    fetchMock.mockResolvedValueOnce(pvcResponse({ uid: 'uid-legacy', labels: null }));
    await expect(driver.exists(VOLUME_NAME, { allowLegacyUnlabeled: true })).resolves.toBe(true);

    fetchMock.mockResolvedValueOnce(pvcResponse({ uid: 'uid-foreign', labels: { app: 'other' } }));
    await expect(driver.exists(VOLUME_NAME, { allowLegacyUnlabeled: true })).rejects.toThrow(
      'missing fastgpt-volume-manager ownership labels'
    );
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it('ensure returns created=false when PVC already exists', async () => {
    fetchMock.mockResolvedValueOnce(pvcResponse({ uid: 'uid-1' }));
    const { K8sVolumeDriver } = await import('../../src/drivers/K8sVolumeDriver');
    const driver = new K8sVolumeDriver();
    const result = await driver.ensure({ claimName: VOLUME_NAME });
    expect(result).toEqual({ claimName: VOLUME_NAME, created: false });
  });

  it('ensure creates PVC on 404', async () => {
    fetchMock
      .mockResolvedValueOnce(notFoundResponse())
      .mockResolvedValueOnce({ ok: true, status: 201 });
    const { K8sVolumeDriver } = await import('../../src/drivers/K8sVolumeDriver');
    const driver = new K8sVolumeDriver();
    const result = await driver.ensure({ claimName: VOLUME_NAME, storageSize: '5Gi' });
    const [, createOpts] = fetchMock.mock.calls[1];
    const body = JSON.parse((createOpts as any).body);

    expect(result).toEqual({ claimName: VOLUME_NAME, created: true });
    expect(body.spec.storageClassName).toBeUndefined();
    expect(body.spec.resources.requests.storage).toBe('5Gi');
    expect(body.metadata.namespace).toBe('opensandbox');
    expect(body.metadata.labels).toEqual({
      app: 'fastgpt',
      'managed-by': 'fastgpt-volume-manager'
    });

    const { env } = await import('../../src/env');
    env.VM_K8S_PVC_STORAGE_CLASS = 'fast-ssd';
    try {
      fetchMock
        .mockResolvedValueOnce(notFoundResponse())
        .mockResolvedValueOnce({ ok: true, status: 201 });
      await driver.ensure({ claimName: VOLUME_NAME, storageSize: '5Gi' });
      const [, explicitOpts] = fetchMock.mock.calls[3];
      const explicitBody = JSON.parse((explicitOpts as any).body);
      expect(explicitBody.spec.storageClassName).toBe('fast-ssd');
    } finally {
      env.VM_K8S_PVC_STORAGE_CLASS = '';
    }
  });

  it('ensure waits for a deleting PVC before creating the next generation', async () => {
    fetchMock
      .mockResolvedValueOnce(
        pvcResponse({ uid: 'uid-1', deletionTimestamp: '2026-07-30T00:00:00Z' })
      )
      .mockResolvedValueOnce(
        pvcResponse({ uid: 'uid-1', deletionTimestamp: '2026-07-30T00:00:00Z' })
      )
      .mockResolvedValueOnce(notFoundResponse())
      .mockResolvedValueOnce(notFoundResponse())
      .mockResolvedValueOnce({ ok: true, status: 201 });
    const { K8sVolumeDriver } = await import('../../src/drivers/K8sVolumeDriver');
    const driver = new K8sVolumeDriver({ waitTimeoutMs: 100, pollIntervalMs: 1 });

    await expect(driver.ensure({ claimName: VOLUME_NAME })).resolves.toEqual({
      claimName: VOLUME_NAME,
      created: true
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('ensure reuses a replacement generation instead of creating another PVC', async () => {
    fetchMock
      .mockResolvedValueOnce(
        pvcResponse({ uid: 'uid-1', deletionTimestamp: '2026-07-30T00:00:00Z' })
      )
      .mockResolvedValueOnce(pvcResponse({ uid: 'uid-2' }))
      .mockResolvedValueOnce(pvcResponse({ uid: 'uid-2' }));
    const { K8sVolumeDriver } = await import('../../src/drivers/K8sVolumeDriver');
    const driver = new K8sVolumeDriver({ waitTimeoutMs: 100, pollIntervalMs: 1 });

    await expect(driver.ensure({ claimName: VOLUME_NAME })).resolves.toEqual({
      claimName: VOLUME_NAME,
      created: false
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('ensure converges after a concurrent create returns 409', async () => {
    fetchMock
      .mockResolvedValueOnce(notFoundResponse())
      .mockResolvedValueOnce(errorResponse(409, 'already exists'))
      .mockResolvedValueOnce(pvcResponse({ uid: 'uid-1' }));
    const { K8sVolumeDriver } = await import('../../src/drivers/K8sVolumeDriver');
    const driver = new K8sVolumeDriver({ waitTimeoutMs: 100, pollIntervalMs: 1 });

    await expect(driver.ensure({ claimName: VOLUME_NAME })).resolves.toEqual({
      claimName: VOLUME_NAME,
      created: false
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('ensure throws on an unexpected create error', async () => {
    fetchMock
      .mockResolvedValueOnce(notFoundResponse())
      .mockResolvedValueOnce(errorResponse(500, 'create failed'));
    const { K8sVolumeDriver } = await import('../../src/drivers/K8sVolumeDriver');
    const driver = new K8sVolumeDriver();

    await expect(driver.ensure({ claimName: VOLUME_NAME })).rejects.toThrow('500');
  });

  it('ensure times out while concurrent create conflicts never settle', async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
      init?.method === 'POST' ? errorResponse(409, 'already exists') : notFoundResponse()
    );
    const { K8sVolumeDriver } = await import('../../src/drivers/K8sVolumeDriver');
    const driver = new K8sVolumeDriver({ waitTimeoutMs: 1, pollIntervalMs: 1 });

    await expect(driver.ensure({ claimName: VOLUME_NAME })).rejects.toThrow('Timed out ensuring');
  });

  it('ensure throws on unexpected GET error', async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(403, 'forbidden'));
    const { K8sVolumeDriver } = await import('../../src/drivers/K8sVolumeDriver');
    const driver = new K8sVolumeDriver();
    await expect(driver.ensure({ claimName: VOLUME_NAME })).rejects.toThrow('403');
  });

  it('ensure throws when an existing PVC response has no UID', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ metadata: {} })
    });
    const { K8sVolumeDriver } = await import('../../src/drivers/K8sVolumeDriver');
    const driver = new K8sVolumeDriver();
    await expect(driver.ensure({ claimName: VOLUME_NAME })).rejects.toThrow('invalid metadata');
  });

  it('fetch calls use an Undici dispatcher with ca.crt loaded', async () => {
    fetchMock.mockResolvedValueOnce(pvcResponse({ uid: 'uid-1' }));
    const { K8sVolumeDriver } = await import('../../src/drivers/K8sVolumeDriver');
    const { readFileSync } = await import('fs');
    const driver = new K8sVolumeDriver();
    await driver.ensure({ claimName: VOLUME_NAME });
    const [, opts] = fetchMock.mock.calls[0];
    expect((opts as any).dispatcher).toBeTruthy();
    expect(readFileSync).toHaveBeenCalledWith(
      '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt',
      'utf-8'
    );
  });

  it('remove treats 404 as success', async () => {
    fetchMock.mockResolvedValueOnce(notFoundResponse());
    const { K8sVolumeDriver } = await import('../../src/drivers/K8sVolumeDriver');
    const driver = new K8sVolumeDriver();
    await expect(driver.remove(VOLUME_NAME)).resolves.toBeUndefined();
  });

  it('remove waits for the target UID to disappear after DELETE 202', async () => {
    fetchMock
      .mockResolvedValueOnce(pvcResponse({ uid: 'uid-1' }))
      .mockResolvedValueOnce({ ok: true, status: 202 })
      .mockResolvedValueOnce(
        pvcResponse({ uid: 'uid-1', deletionTimestamp: '2026-07-30T00:00:00Z' })
      )
      .mockResolvedValueOnce(notFoundResponse());
    const { K8sVolumeDriver } = await import('../../src/drivers/K8sVolumeDriver');
    const driver = new K8sVolumeDriver({ waitTimeoutMs: 100, pollIntervalMs: 1 });

    await expect(driver.remove(VOLUME_NAME)).resolves.toBeUndefined();
    const [, deleteOptions] = fetchMock.mock.calls[1];
    expect(JSON.parse((deleteOptions as any).body)).toEqual({
      apiVersion: 'v1',
      kind: 'DeleteOptions',
      preconditions: { uid: 'uid-1' }
    });
  });

  it('remove treats a DELETE 404 after reading the PVC as idempotent success', async () => {
    fetchMock
      .mockResolvedValueOnce(pvcResponse({ uid: 'uid-1' }))
      .mockResolvedValueOnce(notFoundResponse());
    const { K8sVolumeDriver } = await import('../../src/drivers/K8sVolumeDriver');
    const driver = new K8sVolumeDriver();

    await expect(driver.remove(VOLUME_NAME)).resolves.toBeUndefined();
  });

  it('remove stops when the target UID was replaced', async () => {
    fetchMock
      .mockResolvedValueOnce(pvcResponse({ uid: 'uid-1' }))
      .mockResolvedValueOnce({ ok: true, status: 202 })
      .mockResolvedValueOnce(pvcResponse({ uid: 'uid-2' }));
    const { K8sVolumeDriver } = await import('../../src/drivers/K8sVolumeDriver');
    const driver = new K8sVolumeDriver({ waitTimeoutMs: 100, pollIntervalMs: 1 });

    await expect(driver.remove(VOLUME_NAME)).resolves.toBeUndefined();
  });

  it('remove waits for an already deleting PVC', async () => {
    fetchMock
      .mockResolvedValueOnce(
        pvcResponse({ uid: 'uid-1', deletionTimestamp: '2026-07-30T00:00:00Z' })
      )
      .mockResolvedValueOnce(notFoundResponse());
    const { K8sVolumeDriver } = await import('../../src/drivers/K8sVolumeDriver');
    const driver = new K8sVolumeDriver({ waitTimeoutMs: 100, pollIntervalMs: 1 });

    await expect(driver.remove(VOLUME_NAME)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('remove treats a UID precondition conflict after replacement as success', async () => {
    fetchMock
      .mockResolvedValueOnce(pvcResponse({ uid: 'uid-1' }))
      .mockResolvedValueOnce(errorResponse(409, 'uid precondition failed'))
      .mockResolvedValueOnce(pvcResponse({ uid: 'uid-2' }));
    const { K8sVolumeDriver } = await import('../../src/drivers/K8sVolumeDriver');
    const driver = new K8sVolumeDriver({ waitTimeoutMs: 100, pollIntervalMs: 1 });

    await expect(driver.remove(VOLUME_NAME)).resolves.toBeUndefined();
  });

  it('remove throws when a DELETE conflict still references the target UID', async () => {
    fetchMock
      .mockResolvedValueOnce(pvcResponse({ uid: 'uid-1' }))
      .mockResolvedValueOnce(errorResponse(409, 'conflict'))
      .mockResolvedValueOnce(pvcResponse({ uid: 'uid-1' }));
    const { K8sVolumeDriver } = await import('../../src/drivers/K8sVolumeDriver');
    const driver = new K8sVolumeDriver({ waitTimeoutMs: 100, pollIntervalMs: 1 });

    await expect(driver.remove(VOLUME_NAME)).rejects.toThrow('409');
  });

  it('remove throws on unexpected DELETE error', async () => {
    fetchMock
      .mockResolvedValueOnce(pvcResponse({ uid: 'uid-1' }))
      .mockResolvedValueOnce(errorResponse(500, 'error'));
    const { K8sVolumeDriver } = await import('../../src/drivers/K8sVolumeDriver');
    const driver = new K8sVolumeDriver();
    await expect(driver.remove(VOLUME_NAME)).rejects.toThrow('500');
  });

  it('ensure times out while a PVC generation remains deleting', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith(`/persistentvolumeclaims/${VOLUME_NAME}`)) {
        return pvcResponse({ uid: 'uid-1', deletionTimestamp: '2026-07-30T00:00:00Z' });
      }
      return errorResponse(500, 'unexpected create');
    });
    const { K8sVolumeDriver } = await import('../../src/drivers/K8sVolumeDriver');
    const driver = new K8sVolumeDriver({ waitTimeoutMs: 2, pollIntervalMs: 1 });

    await expect(driver.ensure({ claimName: VOLUME_NAME })).rejects.toThrow('Timed out waiting');
  });

  it('list queries K8s PVCs with managed label selector and filters out deleting/invalid items', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        items: [
          {
            metadata: {
              name: VOLUME_NAME,
              uid: 'uid-1'
            }
          },
          {
            metadata: {
              name: 'fastgpt-session-deleting-pvc',
              uid: 'uid-2',
              deletionTimestamp: '2026-07-30T00:00:00Z'
            }
          },
          {
            metadata: {
              name: 'INVALID_PVC_NAME',
              uid: 'uid-3'
            }
          }
        ]
      })
    });

    const { K8sVolumeDriver } = await import('../../src/drivers/K8sVolumeDriver');
    const driver = new K8sVolumeDriver();
    const items = await driver.list();

    expect(items).toEqual([VOLUME_NAME]);
    const [listUrl] = fetchMock.mock.calls[0];
    expect(decodeURIComponent(String(listUrl))).toContain(
      'labelSelector=app=fastgpt,managed-by=fastgpt-volume-manager'
    );
  });

  it('ensure and remove refuse to touch existing PVCs lacking ownership labels', async () => {
    const { K8sVolumeDriver } = await import('../../src/drivers/K8sVolumeDriver');
    const driver = new K8sVolumeDriver();

    fetchMock.mockResolvedValueOnce(
      pvcResponse({ uid: 'uid-unmanaged', labels: { app: 'other' } })
    );
    await expect(driver.ensure({ claimName: VOLUME_NAME })).rejects.toThrow(
      'missing fastgpt-volume-manager ownership labels'
    );

    fetchMock.mockResolvedValueOnce(pvcResponse({ uid: 'uid-unmanaged', labels: null }));
    await expect(driver.remove(VOLUME_NAME)).rejects.toThrow(
      'missing fastgpt-volume-manager ownership labels'
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('remove deletes legacy unlabeled PVCs when allowLegacyUnlabeled=true while still rejecting foreign labels', async () => {
    const { K8sVolumeDriver } = await import('../../src/drivers/K8sVolumeDriver');
    const driver = new K8sVolumeDriver({ waitTimeoutMs: 100, pollIntervalMs: 1 });

    fetchMock.mockResolvedValueOnce(pvcResponse({ uid: 'uid-legacy', labels: null }));
    await expect(driver.ensure({ claimName: VOLUME_NAME })).rejects.toThrow(
      'missing fastgpt-volume-manager ownership labels'
    );

    fetchMock
      .mockResolvedValueOnce(pvcResponse({ uid: 'uid-legacy', labels: null }))
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce(notFoundResponse());
    await expect(
      driver.remove(VOLUME_NAME, { allowLegacyUnlabeled: true })
    ).resolves.toBeUndefined();

    fetchMock.mockResolvedValueOnce(
      pvcResponse({ uid: 'uid-foreign', labels: { 'managed-by': 'helm' } })
    );
    await expect(driver.remove(VOLUME_NAME, { allowLegacyUnlabeled: true })).rejects.toThrow(
      'missing fastgpt-volume-manager ownership labels'
    );

    const foreignLabelCases: Record<string, string>[] = [
      { 'k8s-app': 'metrics-server' },
      { 'helm.sh/chart': 'redis-18.0.0' },
      { 'app.kubernetes.io/part-of': 'logging' },
      { 'com.docker.compose.service': 'worker' }
    ];
    for (const foreignLabels of foreignLabelCases) {
      fetchMock.mockResolvedValueOnce(pvcResponse({ uid: 'uid-foreign', labels: foreignLabels }));
      await expect(driver.exists(VOLUME_NAME, { allowLegacyUnlabeled: true })).rejects.toThrow(
        'missing fastgpt-volume-manager ownership labels'
      );
    }
  });
});
