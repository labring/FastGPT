import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const VOLUME_NAME = 'fastgpt-session-a1b2c3d4e5f6a1b2c3d4e5f6-generation';

// Mock env before importing driver
vi.mock('../../src/env', () => ({
  env: {
    VM_DOCKER_SOCKET: '/var/run/docker.sock'
  }
}));

const MANAGED_LABELS = {
  app: 'fastgpt',
  'managed-by': 'fastgpt-volume-manager'
};

describe('DockerVolumeDriver', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('exists inspects volume without creating on 404 and checks ownership labels', async () => {
    const { DockerVolumeDriver } = await import('../../src/drivers/DockerVolumeDriver');
    const driver = new DockerVolumeDriver();

    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, text: async () => '' });
    await expect(driver.exists(VOLUME_NAME)).resolves.toBe(false);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ Name: VOLUME_NAME, Labels: MANAGED_LABELS })
    });
    await expect(driver.exists(VOLUME_NAME)).resolves.toBe(true);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ Name: VOLUME_NAME, Labels: null })
    });
    await expect(driver.exists(VOLUME_NAME)).rejects.toThrow(
      'missing fastgpt-volume-manager ownership labels'
    );

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ Name: VOLUME_NAME, Labels: null })
    });
    await expect(driver.exists(VOLUME_NAME, { allowLegacyUnlabeled: true })).resolves.toBe(true);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ Name: VOLUME_NAME, Labels: { app: 'other' } })
    });
    await expect(driver.exists(VOLUME_NAME, { allowLegacyUnlabeled: true })).rejects.toThrow(
      'missing fastgpt-volume-manager ownership labels'
    );
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('ensure returns created=false when managed volume already exists', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ Name: VOLUME_NAME, Labels: MANAGED_LABELS })
    });
    const { DockerVolumeDriver } = await import('../../src/drivers/DockerVolumeDriver');
    const driver = new DockerVolumeDriver();
    const result = await driver.ensure({ claimName: VOLUME_NAME });
    expect(result).toEqual({ claimName: VOLUME_NAME, created: false });
    const [, opts] = fetchMock.mock.calls[0];
    expect((opts as any).dispatcher).toBeTruthy();
  });

  it('ensure creates volume on 404 with managed labels', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 404, text: async () => '' })
      .mockResolvedValueOnce({ ok: true, status: 201 });
    const { DockerVolumeDriver } = await import('../../src/drivers/DockerVolumeDriver');
    const driver = new DockerVolumeDriver();
    const result = await driver.ensure({ claimName: VOLUME_NAME });
    expect(result).toEqual({ claimName: VOLUME_NAME, created: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, createOpts] = fetchMock.mock.calls[1];
    expect(JSON.parse((createOpts as any).body)).toEqual({
      Name: VOLUME_NAME,
      Labels: {
        app: 'fastgpt',
        'managed-by': 'fastgpt-volume-manager'
      }
    });
  });

  it('ensure throws on unexpected inspect error', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'server error' });
    const { DockerVolumeDriver } = await import('../../src/drivers/DockerVolumeDriver');
    const driver = new DockerVolumeDriver();
    await expect(driver.ensure({ claimName: VOLUME_NAME })).rejects.toThrow('500');
  });

  it('remove treats 404 as success and deletes existing managed volume after label inspect', async () => {
    const { DockerVolumeDriver } = await import('../../src/drivers/DockerVolumeDriver');
    const driver = new DockerVolumeDriver();

    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, text: async () => '' });
    await expect(driver.remove(VOLUME_NAME)).resolves.toBeUndefined();

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ Name: VOLUME_NAME, Labels: MANAGED_LABELS })
      })
      .mockResolvedValueOnce({ ok: true, status: 204 });
    await expect(driver.remove(VOLUME_NAME)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('ensure and remove reject Docker volumes without ownership labels', async () => {
    const { DockerVolumeDriver } = await import('../../src/drivers/DockerVolumeDriver');
    const driver = new DockerVolumeDriver();

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ Name: VOLUME_NAME, Labels: { app: 'other' } })
    });
    await expect(driver.ensure({ claimName: VOLUME_NAME })).rejects.toThrow(
      'missing fastgpt-volume-manager ownership labels'
    );

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ Name: VOLUME_NAME, Labels: null })
    });
    await expect(driver.remove(VOLUME_NAME)).rejects.toThrow(
      'missing fastgpt-volume-manager ownership labels'
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('remove deletes legacy unlabeled Docker volumes when allowLegacyUnlabeled=true while still rejecting foreign labels', async () => {
    const { DockerVolumeDriver } = await import('../../src/drivers/DockerVolumeDriver');
    const driver = new DockerVolumeDriver();

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ Name: VOLUME_NAME, Labels: null })
    });
    await expect(driver.ensure({ claimName: VOLUME_NAME })).rejects.toThrow(
      'Refusing to inspect Docker volume'
    );

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ Name: VOLUME_NAME, Labels: null })
      })
      .mockResolvedValueOnce({ ok: true, status: 204 });
    await expect(
      driver.remove(VOLUME_NAME, { allowLegacyUnlabeled: true })
    ).resolves.toBeUndefined();

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ Name: VOLUME_NAME, Labels: { 'managed-by': 'helm' } })
    });
    await expect(driver.remove(VOLUME_NAME, { allowLegacyUnlabeled: true })).rejects.toThrow(
      'Refusing to delete Docker volume'
    );

    for (const foreignLabels of [
      { 'k8s-app': 'kube-dns' },
      { 'helm.sh/chart': 'postgresql-12.0.0' },
      { 'app.kubernetes.io/part-of': 'monitoring' },
      { 'com.docker.compose.service': 'postgres' }
    ]) {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ Name: VOLUME_NAME, Labels: foreignLabels })
      });
      await expect(driver.exists(VOLUME_NAME, { allowLegacyUnlabeled: true })).rejects.toThrow(
        'Refusing to inspect Docker volume'
      );
    }
  });

  it('list queries Docker volumes with managed label filters and skips invalid names', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        Volumes: [{ Name: VOLUME_NAME }, { Name: 'INVALID_VOLUME_NAME' }]
      })
    });

    const { DockerVolumeDriver } = await import('../../src/drivers/DockerVolumeDriver');
    const driver = new DockerVolumeDriver();
    const items = await driver.list();

    expect(items).toEqual([VOLUME_NAME]);
    const [url] = fetchMock.mock.calls[0];
    expect(decodeURIComponent(String(url))).toContain('managed-by=fastgpt-volume-manager');
  });
});
