import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const VOLUME_NAME = 'fastgpt-session-a1b2c3d4e5f6a1b2c3d4e5f6-generation';

// Mock env before importing driver
vi.mock('../../src/env', () => ({
  env: {
    VM_DOCKER_SOCKET: '/var/run/docker.sock'
  }
}));

describe('DockerVolumeDriver', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('ensure returns created=false when volume already exists', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });
    const { DockerVolumeDriver } = await import('../../src/drivers/DockerVolumeDriver');
    const driver = new DockerVolumeDriver();
    const result = await driver.ensure({ claimName: VOLUME_NAME });
    expect(result).toEqual({ claimName: VOLUME_NAME, created: false });
    const [, opts] = fetchMock.mock.calls[0];
    expect((opts as any).dispatcher).toBeTruthy();
  });

  it('ensure creates volume on 404', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 404, text: async () => '' })
      .mockResolvedValueOnce({ ok: true, status: 201 });
    const { DockerVolumeDriver } = await import('../../src/drivers/DockerVolumeDriver');
    const driver = new DockerVolumeDriver();
    const result = await driver.ensure({ claimName: VOLUME_NAME });
    expect(result).toEqual({ claimName: VOLUME_NAME, created: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('ensure throws on unexpected inspect error', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'server error' });
    const { DockerVolumeDriver } = await import('../../src/drivers/DockerVolumeDriver');
    const driver = new DockerVolumeDriver();
    await expect(driver.ensure({ claimName: VOLUME_NAME })).rejects.toThrow('500');
  });

  it('remove treats 404 as success', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, text: async () => '' });
    const { DockerVolumeDriver } = await import('../../src/drivers/DockerVolumeDriver');
    const driver = new DockerVolumeDriver();
    await expect(driver.remove(VOLUME_NAME)).resolves.toBeUndefined();
  });
});
