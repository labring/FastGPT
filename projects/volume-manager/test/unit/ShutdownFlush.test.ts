import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/env', () => ({
  env: {
    PORT: 3000,
    VM_AUTH_TOKEN: 'secret-token',
    VM_RUNTIME: 'kubernetes',
    VM_DOCKER_SOCKET: '/var/run/docker.sock',
    VM_DOCKER_API_VERSION: 'v1.44',
    VM_K8S_NAMESPACE: 'opensandbox',
    VM_K8S_PVC_STORAGE_CLASS: ''
  }
}));

import type { IVolumeDriver } from '../../src/drivers/IVolumeDriver';
import { createVolumeManagerApp } from '../../src/index';
import { configureLogger, disposeLogger } from '../../src/utils/logger';

describe('volume-manager shutdown log flush', () => {
  afterEach(async () => {
    await disposeLogger();
    vi.restoreAllMocks();
  });

  it('flushes buffered 500 error log immediately on disposeLogger', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await configureLogger();

    const driver: IVolumeDriver = {
      exists: vi.fn(),
      ensure: vi.fn(),
      remove: vi.fn(),
      list: vi.fn().mockRejectedValueOnce(new Error('boom-500'))
    };
    const app = createVolumeManagerApp(driver, 'secret-token');

    const res = await app.request('/v1/volumes', {
      headers: { Authorization: 'Bearer secret-token' }
    });
    expect(res.status).toBe(500);

    await disposeLogger();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logged = String(errorSpy.mock.calls[0]?.[0]);
    expect(logged).toContain('Unhandled request error');
    expect(logged).toContain('boom-500');
  });
});
