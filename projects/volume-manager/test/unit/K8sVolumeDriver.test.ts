import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const VALID_ID = 'a1b2c3d4e5f6a1b2c3d4e5f6';
const VOLUME_NAME = `fastgpt-session-${VALID_ID}`;

vi.mock('../../src/env', () => ({
  env: {
    VM_K8S_NAMESPACE: 'opensandbox',
    VM_VOLUME_NAME_PREFIX: 'fastgpt-session',
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

  const pvcResponse = (uid: string, deletionTimestamp?: string) => ({
    ok: true,
    status: 200,
    json: async () => ({
      metadata: {
        uid,
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

  it('ensure returns created=false when PVC already exists', async () => {
    fetchMock.mockResolvedValueOnce(pvcResponse('uid-1'));
    const { K8sVolumeDriver } = await import('../../src/drivers/K8sVolumeDriver');
    const driver = new K8sVolumeDriver();
    const result = await driver.ensure(VALID_ID);
    expect(result).toEqual({ claimName: VOLUME_NAME, created: false });
  });

  it('ensure creates PVC on 404', async () => {
    fetchMock
      .mockResolvedValueOnce(notFoundResponse())
      .mockResolvedValueOnce({ ok: true, status: 201 });
    const { K8sVolumeDriver } = await import('../../src/drivers/K8sVolumeDriver');
    const driver = new K8sVolumeDriver();
    const result = await driver.ensure(VALID_ID, '5Gi');
    const [, createOpts] = fetchMock.mock.calls[1];
    const body = JSON.parse((createOpts as any).body);

    expect(result).toEqual({ claimName: VOLUME_NAME, created: true });
    expect(body.spec.storageClassName).toBe('');
    expect(body.spec.resources.requests.storage).toBe('5Gi');
    expect(body.metadata.namespace).toBe('opensandbox');
  });

  it('ensure waits for a deleting PVC before creating the next generation', async () => {
    fetchMock
      .mockResolvedValueOnce(pvcResponse('uid-1', '2026-07-30T00:00:00Z'))
      .mockResolvedValueOnce(pvcResponse('uid-1', '2026-07-30T00:00:00Z'))
      .mockResolvedValueOnce(notFoundResponse())
      .mockResolvedValueOnce(notFoundResponse())
      .mockResolvedValueOnce({ ok: true, status: 201 });
    const { K8sVolumeDriver } = await import('../../src/drivers/K8sVolumeDriver');
    const driver = new K8sVolumeDriver({ waitTimeoutMs: 100, pollIntervalMs: 1 });

    await expect(driver.ensure(VALID_ID)).resolves.toEqual({
      claimName: VOLUME_NAME,
      created: true
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('ensure reuses a replacement generation instead of creating another PVC', async () => {
    fetchMock
      .mockResolvedValueOnce(pvcResponse('uid-1', '2026-07-30T00:00:00Z'))
      .mockResolvedValueOnce(pvcResponse('uid-2'))
      .mockResolvedValueOnce(pvcResponse('uid-2'));
    const { K8sVolumeDriver } = await import('../../src/drivers/K8sVolumeDriver');
    const driver = new K8sVolumeDriver({ waitTimeoutMs: 100, pollIntervalMs: 1 });

    await expect(driver.ensure(VALID_ID)).resolves.toEqual({
      claimName: VOLUME_NAME,
      created: false
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('ensure converges after a concurrent create returns 409', async () => {
    fetchMock
      .mockResolvedValueOnce(notFoundResponse())
      .mockResolvedValueOnce(errorResponse(409, 'already exists'))
      .mockResolvedValueOnce(pvcResponse('uid-1'));
    const { K8sVolumeDriver } = await import('../../src/drivers/K8sVolumeDriver');
    const driver = new K8sVolumeDriver({ waitTimeoutMs: 100, pollIntervalMs: 1 });

    await expect(driver.ensure(VALID_ID)).resolves.toEqual({
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

    await expect(driver.ensure(VALID_ID)).rejects.toThrow('500');
  });

  it('ensure times out while concurrent create conflicts never settle', async () => {
    fetchMock
      .mockResolvedValueOnce(notFoundResponse())
      .mockResolvedValueOnce(errorResponse(409, 'already exists'))
      .mockResolvedValueOnce(notFoundResponse())
      .mockResolvedValueOnce(errorResponse(409, 'already exists'));
    const { K8sVolumeDriver } = await import('../../src/drivers/K8sVolumeDriver');
    const driver = new K8sVolumeDriver({ waitTimeoutMs: 1, pollIntervalMs: 1 });

    await expect(driver.ensure(VALID_ID)).rejects.toThrow('Timed out ensuring');
  });

  it('ensure throws on unexpected GET error', async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(403, 'forbidden'));
    const { K8sVolumeDriver } = await import('../../src/drivers/K8sVolumeDriver');
    const driver = new K8sVolumeDriver();
    await expect(driver.ensure(VALID_ID)).rejects.toThrow('403');
  });

  it('ensure throws when an existing PVC response has no UID', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ metadata: {} })
    });
    const { K8sVolumeDriver } = await import('../../src/drivers/K8sVolumeDriver');
    const driver = new K8sVolumeDriver();
    await expect(driver.ensure(VALID_ID)).rejects.toThrow('invalid metadata');
  });

  it('fetch calls use an Undici dispatcher with ca.crt loaded', async () => {
    fetchMock.mockResolvedValueOnce(pvcResponse('uid-1'));
    const { K8sVolumeDriver } = await import('../../src/drivers/K8sVolumeDriver');
    const { readFileSync } = await import('fs');
    const driver = new K8sVolumeDriver();
    await driver.ensure(VALID_ID);
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
    await expect(driver.remove(VALID_ID)).resolves.toBeUndefined();
  });

  it('remove waits for the target UID to disappear after DELETE 202', async () => {
    fetchMock
      .mockResolvedValueOnce(pvcResponse('uid-1'))
      .mockResolvedValueOnce({ ok: true, status: 202 })
      .mockResolvedValueOnce(pvcResponse('uid-1', '2026-07-30T00:00:00Z'))
      .mockResolvedValueOnce(notFoundResponse());
    const { K8sVolumeDriver } = await import('../../src/drivers/K8sVolumeDriver');
    const driver = new K8sVolumeDriver({ waitTimeoutMs: 100, pollIntervalMs: 1 });

    await expect(driver.remove(VALID_ID)).resolves.toBeUndefined();
    const [, deleteOptions] = fetchMock.mock.calls[1];
    expect(JSON.parse((deleteOptions as any).body)).toEqual({
      apiVersion: 'v1',
      kind: 'DeleteOptions',
      preconditions: { uid: 'uid-1' }
    });
  });

  it('remove treats a DELETE 404 after reading the PVC as idempotent success', async () => {
    fetchMock.mockResolvedValueOnce(pvcResponse('uid-1')).mockResolvedValueOnce(notFoundResponse());
    const { K8sVolumeDriver } = await import('../../src/drivers/K8sVolumeDriver');
    const driver = new K8sVolumeDriver();

    await expect(driver.remove(VALID_ID)).resolves.toBeUndefined();
  });

  it('remove stops when the target UID was replaced', async () => {
    fetchMock
      .mockResolvedValueOnce(pvcResponse('uid-1'))
      .mockResolvedValueOnce({ ok: true, status: 202 })
      .mockResolvedValueOnce(pvcResponse('uid-2'));
    const { K8sVolumeDriver } = await import('../../src/drivers/K8sVolumeDriver');
    const driver = new K8sVolumeDriver({ waitTimeoutMs: 100, pollIntervalMs: 1 });

    await expect(driver.remove(VALID_ID)).resolves.toBeUndefined();
  });

  it('remove waits for an already deleting PVC', async () => {
    fetchMock
      .mockResolvedValueOnce(pvcResponse('uid-1', '2026-07-30T00:00:00Z'))
      .mockResolvedValueOnce(notFoundResponse());
    const { K8sVolumeDriver } = await import('../../src/drivers/K8sVolumeDriver');
    const driver = new K8sVolumeDriver({ waitTimeoutMs: 100, pollIntervalMs: 1 });

    await expect(driver.remove(VALID_ID)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('remove treats a UID precondition conflict after replacement as success', async () => {
    fetchMock
      .mockResolvedValueOnce(pvcResponse('uid-1'))
      .mockResolvedValueOnce(errorResponse(409, 'uid precondition failed'))
      .mockResolvedValueOnce(pvcResponse('uid-2'));
    const { K8sVolumeDriver } = await import('../../src/drivers/K8sVolumeDriver');
    const driver = new K8sVolumeDriver({ waitTimeoutMs: 100, pollIntervalMs: 1 });

    await expect(driver.remove(VALID_ID)).resolves.toBeUndefined();
  });

  it('remove throws when a DELETE conflict still references the target UID', async () => {
    fetchMock
      .mockResolvedValueOnce(pvcResponse('uid-1'))
      .mockResolvedValueOnce(errorResponse(409, 'conflict'))
      .mockResolvedValueOnce(pvcResponse('uid-1'));
    const { K8sVolumeDriver } = await import('../../src/drivers/K8sVolumeDriver');
    const driver = new K8sVolumeDriver({ waitTimeoutMs: 100, pollIntervalMs: 1 });

    await expect(driver.remove(VALID_ID)).rejects.toThrow('409');
  });

  it('remove throws on unexpected DELETE error', async () => {
    fetchMock
      .mockResolvedValueOnce(pvcResponse('uid-1'))
      .mockResolvedValueOnce(errorResponse(500, 'error'));
    const { K8sVolumeDriver } = await import('../../src/drivers/K8sVolumeDriver');
    const driver = new K8sVolumeDriver();
    await expect(driver.remove(VALID_ID)).rejects.toThrow('500');
  });

  it('ensure times out while a PVC generation remains deleting', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/persistentvolumeclaims/fastgpt-session-' + VALID_ID)) {
        return pvcResponse('uid-1', '2026-07-30T00:00:00Z');
      }
      return errorResponse(500, 'unexpected create');
    });
    const { K8sVolumeDriver } = await import('../../src/drivers/K8sVolumeDriver');
    const driver = new K8sVolumeDriver({ waitTimeoutMs: 2, pollIntervalMs: 1 });

    await expect(driver.ensure(VALID_ID)).rejects.toThrow('Timed out waiting');
  });

  it('rejects invalid wait options', async () => {
    const { K8sVolumeDriver } = await import('../../src/drivers/K8sVolumeDriver');
    expect(() => new K8sVolumeDriver({ waitTimeoutMs: 0 })).toThrow('must be positive');
  });
});
