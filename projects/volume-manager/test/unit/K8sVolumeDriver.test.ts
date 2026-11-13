import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VolumeOwnershipError } from '../../src/drivers/IVolumeDriver';
import { K8sVolumeDriver } from '../../src/drivers/K8sVolumeDriver';

const DEPLOYMENT_ID = '0123456789abcdef0123456789abcdef';
const OWNER_LABELS = {
  app: 'fastgpt',
  'managed-by': 'fastgpt-volume-manager',
  'fastgpt.deployment': DEPLOYMENT_ID
};
const VOLUME_NAME = 'fastgpt-session-a1b2c3d4e5f6a1b2c3d4e5f6-generation';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn((path: string) => {
    if (path.endsWith('ca.crt')) return 'mock-ca-cert';
    return 'mock-token';
  })
}));

describe('K8sVolumeDriver', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  const pvcResponse = (uid: string, deletionTimestamp?: string, labels = OWNER_LABELS) => ({
    ok: true,
    status: 200,
    json: async () => ({
      metadata: {
        uid,
        labels,
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

  const makeDriver = (overrides: ConstructorParameters<typeof K8sVolumeDriver>[0] = {}) =>
    new K8sVolumeDriver({
      namespace: 'opensandbox',
      storageClassName: 'juicefs-sc',
      waitTimeoutMs: 50,
      pollIntervalMs: 1,
      ...overrides
    });

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects empty namespace or storageClassName at construction', () => {
    expect(() => makeDriver({ namespace: '   ' })).toThrow('VM_K8S_NAMESPACE is required');
    expect(() => makeDriver({ storageClassName: '   ' })).toThrow(
      'VM_K8S_PVC_STORAGE_CLASS is required'
    );
  });

  it('creates PVC with trimmed JuiceFS storageClassName, 1Gi default or explicit size, and CA TLS dispatcher', async () => {
    fetchMock
      .mockResolvedValueOnce(notFoundResponse())
      .mockResolvedValueOnce({ ok: true, status: 201 })
      .mockResolvedValueOnce(pvcResponse('uid-1'));
    const { readFileSync } = await import('node:fs');
    const driver = makeDriver({ storageClassName: ' juicefs-sc ' });

    await expect(
      driver.ensure({ claimName: VOLUME_NAME, deploymentId: DEPLOYMENT_ID })
    ).resolves.toEqual({ claimName: VOLUME_NAME, created: true });

    const [, createInit] = fetchMock.mock.calls[1];
    expect((createInit as { dispatcher?: unknown }).dispatcher).toBeTruthy();
    expect(readFileSync).toHaveBeenCalledWith(
      '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt',
      'utf-8'
    );
    expect(JSON.parse((createInit as { body: string }).body)).toMatchObject({
      metadata: { name: VOLUME_NAME, namespace: 'opensandbox', labels: OWNER_LABELS },
      spec: {
        storageClassName: 'juicefs-sc',
        resources: { requests: { storage: '1Gi' } }
      }
    });

    await expect(
      driver.ensure({ claimName: VOLUME_NAME, deploymentId: DEPLOYMENT_ID })
    ).resolves.toEqual({ claimName: VOLUME_NAME, created: false });
  });

  it('scopes list by labelSelector and filters out unowned or deleting PVCs', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        items: [
          { metadata: { name: 'pvc-active', labels: OWNER_LABELS } },
          { metadata: { name: 'pvc-unowned' } },
          {
            metadata: {
              name: 'pvc-other-deployment',
              labels: { ...OWNER_LABELS, 'fastgpt.deployment': 'f'.repeat(32) }
            }
          },
          {
            metadata: {
              name: 'pvc-deleting',
              labels: OWNER_LABELS,
              deletionTimestamp: '2026-07-30T00:00:00Z'
            }
          }
        ]
      })
    });

    await expect(makeDriver().list(DEPLOYMENT_ID)).resolves.toEqual(['pvc-active']);
    expect(fetchMock.mock.calls[0][0]).toContain(
      `labelSelector=app%3Dfastgpt%2Cmanaged-by%3Dfastgpt-volume-manager%2Cfastgpt.deployment%3D${DEPLOYMENT_ID}`
    );
  });

  it('enforces deployment ownership across ensure, unmount, and remove', async () => {
    const mismatched = {
      ok: true,
      status: 200,
      json: async () => ({
        metadata: {
          uid: 'uid-other',
          labels: { ...OWNER_LABELS, 'fastgpt.deployment': 'f'.repeat(32) }
        }
      })
    };
    const driver = makeDriver();

    fetchMock.mockResolvedValueOnce(mismatched);
    await expect(
      driver.ensure({ claimName: VOLUME_NAME, deploymentId: DEPLOYMENT_ID })
    ).rejects.toBeInstanceOf(VolumeOwnershipError);

    fetchMock.mockResolvedValueOnce(mismatched);
    await expect(driver.unmount(VOLUME_NAME, DEPLOYMENT_ID)).rejects.toBeInstanceOf(
      VolumeOwnershipError
    );

    fetchMock.mockResolvedValueOnce(mismatched);
    await expect(driver.remove(VOLUME_NAME, DEPLOYMENT_ID)).rejects.toBeInstanceOf(
      VolumeOwnershipError
    );
  });

  it('waits for deleting generation or 409 create race on ensure, and times out when stuck', async () => {
    const driver = makeDriver({ waitTimeoutMs: 20, pollIntervalMs: 1 });

    // Deleting generation finishes -> creates new generation
    fetchMock
      .mockResolvedValueOnce(pvcResponse('uid-1', '2026-07-30T00:00:00Z'))
      .mockResolvedValueOnce(notFoundResponse())
      .mockResolvedValueOnce(notFoundResponse())
      .mockResolvedValueOnce({ ok: true, status: 201 });
    await expect(
      driver.ensure({ claimName: VOLUME_NAME, deploymentId: DEPLOYMENT_ID })
    ).resolves.toEqual({ claimName: VOLUME_NAME, created: true });

    // Concurrent 409 create race converges to active PVC
    fetchMock
      .mockResolvedValueOnce(notFoundResponse())
      .mockResolvedValueOnce(errorResponse(409, 'already exists'))
      .mockResolvedValueOnce(pvcResponse('uid-2'));
    await expect(
      driver.ensure({ claimName: VOLUME_NAME, deploymentId: DEPLOYMENT_ID })
    ).resolves.toEqual({ claimName: VOLUME_NAME, created: false });

    // Stuck deleting generation times out
    fetchMock.mockImplementation(async () => pvcResponse('uid-stuck', '2026-07-30T00:00:00Z'));
    await expect(
      makeDriver({ waitTimeoutMs: 3, pollIntervalMs: 1 }).ensure({
        claimName: VOLUME_NAME,
        deploymentId: DEPLOYMENT_ID
      })
    ).rejects.toThrow('Timed out waiting');
  });

  it('deletes with UID precondition, handles replacement UID safely, and rejects same-UID 409 conflict', async () => {
    const driver = makeDriver();

    // 404 is idempotent
    fetchMock.mockResolvedValueOnce(notFoundResponse());
    await expect(driver.remove(VOLUME_NAME, DEPLOYMENT_ID)).resolves.toBeUndefined();

    // DELETE 202 with preconditions.uid -> waits until absent
    fetchMock
      .mockResolvedValueOnce(pvcResponse('uid-1'))
      .mockResolvedValueOnce({ ok: true, status: 202 })
      .mockResolvedValueOnce(pvcResponse('uid-1', '2026-07-30T00:00:00Z'))
      .mockResolvedValueOnce(notFoundResponse());
    await expect(driver.remove(VOLUME_NAME, DEPLOYMENT_ID)).resolves.toBeUndefined();
    expect(JSON.parse((fetchMock.mock.calls[2][1] as { body: string }).body)).toEqual({
      apiVersion: 'v1',
      kind: 'DeleteOptions',
      preconditions: { uid: 'uid-1' }
    });

    // UID precondition 409 because a newer UID replaced it -> treated as deleted
    fetchMock
      .mockResolvedValueOnce(pvcResponse('uid-1'))
      .mockResolvedValueOnce(errorResponse(409, 'uid precondition failed'))
      .mockResolvedValueOnce(pvcResponse('uid-2'));
    await expect(driver.remove(VOLUME_NAME, DEPLOYMENT_ID)).resolves.toBeUndefined();

    // UID precondition 409 while same UID still exists -> surfaces error
    fetchMock
      .mockResolvedValueOnce(pvcResponse('uid-1'))
      .mockResolvedValueOnce(errorResponse(409, 'conflict'))
      .mockResolvedValueOnce(pvcResponse('uid-1'));
    await expect(driver.remove(VOLUME_NAME, DEPLOYMENT_ID)).rejects.toThrow('409');
  });
});
