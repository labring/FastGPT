import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const VOLUME_NAME = 'fastgpt-session-app-a1b2c3d4-generation';
const DEPLOYMENT_ID = '0123456789abcdef0123456789abcdef';
const META_URL = 'postgres://juicefs:test@pg:5432/meta';
const SANITIZED_META_URL =
  'postgres://juicefs@pg:5432/meta?max_open_conns=4&max_idle_conns=1&max_idle_time=60';
const BUCKET_URL = 'http://fastgpt-sandbox-rustfs:9000/fastgpt-sandbox';
const OWNER_LABELS = {
  app: 'fastgpt',
  'fastgpt.sandbox.claim': VOLUME_NAME,
  'fastgpt.deployment': DEPLOYMENT_ID
};

const fsMocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  stat: vi.fn(),
  chown: vi.fn(),
  chmod: vi.fn()
}));

const envMock = vi.hoisted(() => ({
  VM_JUICEFS_META_URL: 'postgres://juicefs:test@pg:5432/meta',
  VM_JUICEFS_STORAGE: 'minio',
  VM_JUICEFS_BUCKET: 'http://fastgpt-sandbox-rustfs:9000/fastgpt-sandbox',
  VM_JUICEFS_ACCESS_KEY: 'rustfsadmin',
  VM_JUICEFS_SECRET_KEY: 'super-secret-s3-key'
}));

vi.mock('node:fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs/promises')>()),
  ...fsMocks
}));
vi.mock('../../src/env', () => ({
  env: envMock
}));

import {
  buildJuicefsCommandCredentials,
  DockerVolumeDriver,
  parseStorageCapacityGiB,
  type CommandExecutionParams
} from '../../src/drivers/DockerVolumeDriver';
import { VolumeOwnershipError } from '../../src/drivers/IVolumeDriver';

const volumeResponse = (status = 200, labels = OWNER_LABELS) =>
  new Response(JSON.stringify({ Name: VOLUME_NAME, Labels: labels }), { status });

describe('DockerVolumeDriver', () => {
  let fetchMock: ReturnType<typeof vi.fn<(url: string, init?: RequestInit) => Promise<Response>>>;
  let runCommand: ReturnType<typeof vi.fn<(_params: CommandExecutionParams) => Promise<void>>>;
  let mountRoot: string;
  const tempDirs: string[] = [];

  beforeEach(async () => {
    vi.clearAllMocks();
    envMock.VM_JUICEFS_META_URL = META_URL;
    envMock.VM_JUICEFS_STORAGE = 'minio';
    envMock.VM_JUICEFS_BUCKET = BUCKET_URL;
    envMock.VM_JUICEFS_ACCESS_KEY = 'rustfsadmin';
    envMock.VM_JUICEFS_SECRET_KEY = 'super-secret-s3-key';

    mountRoot = await mkdtemp(join(tmpdir(), 'fastgpt-volume-test-'));
    tempDirs.push(mountRoot);

    const actualFs = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    fsMocks.readFile.mockResolvedValue('');
    fsMocks.stat.mockImplementation(actualFs.stat);
    fsMocks.chown.mockResolvedValue(undefined);
    fsMocks.chmod.mockResolvedValue(undefined);
    runCommand = vi.fn(async () => undefined);
    fetchMock = vi.fn();

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === 'http://localhost/version') {
          return new Response(JSON.stringify({ ApiVersion: '1.56', MinAPIVersion: '1.40' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'Api-Version': '1.56' }
          });
        }
        return fetchMock(url, init);
      })
    );
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })));
  });

  it('defaults storage capacity to 1 GiB and converts explicit units to whole GiB', () => {
    expect(parseStorageCapacityGiB()).toBe(1);
    expect(parseStorageCapacityGiB('invalid')).toBe(1);
    expect(parseStorageCapacityGiB('1Gi')).toBe(1);
    expect(parseStorageCapacityGiB('2048Mi')).toBe(2);
    expect(parseStorageCapacityGiB('1.5Gi')).toBe(2);
  });

  it('normalizes PostgreSQL, OceanBase/MySQL, and KV metadata URLs with safe credential extraction and pool bounds', () => {
    expect(
      buildJuicefsCommandCredentials({
        metaUrl:
          'postgresql://postgres:p%40ss@pg.local:5432/juicefs?sslmode=disable&application_name=vm@prod&max_open_conns=20',
        accessKey: '',
        secretKey: ''
      })
    ).toEqual({
      sanitizedMetaUrl:
        'postgres://postgres@pg.local:5432/juicefs?sslmode=disable&application_name=vm@prod&max_open_conns=20&max_idle_conns=1&max_idle_time=60',
      extraEnv: { META_PASSWORD: 'p@ss' }
    });

    expect(
      buildJuicefsCommandCredentials({
        metaUrl: 'mysql://root@sys#cluster:p@ss:word@(ob.local:2881)/jfs_meta?charset=utf8mb4',
        accessKey: '',
        secretKey: ''
      })
    ).toEqual({
      sanitizedMetaUrl:
        'mysql://root@sys#cluster@(ob.local:2881)/jfs_meta?charset=utf8mb4&max_open_conns=4&max_idle_conns=1&max_idle_time=60',
      extraEnv: { META_PASSWORD: 'p@ss:word' }
    });

    expect(
      buildJuicefsCommandCredentials({
        metaUrl: 'mariadb://root%40tenant:p%40ss@ob.local:2881/jfs_meta',
        accessKey: '',
        secretKey: ''
      })
    ).toEqual({
      sanitizedMetaUrl:
        'mysql://root@tenant@tcp(ob.local:2881)/jfs_meta?max_open_conns=4&max_idle_conns=1&max_idle_time=60',
      extraEnv: { META_PASSWORD: 'p@ss' }
    });

    expect(
      buildJuicefsCommandCredentials({
        metaUrl: 'redis://:redis-secret@fastgpt-redis:6379/1',
        accessKey: '',
        secretKey: ''
      })
    ).toEqual({
      sanitizedMetaUrl: 'redis://fastgpt-redis:6379/1',
      extraEnv: { META_PASSWORD: 'redis-secret' }
    });

    expect(
      buildJuicefsCommandCredentials({
        metaUrl: 'postgres://postgres:sock%40pw@/juicefs?host=/var/run/postgresql',
        accessKey: '',
        secretKey: ''
      })
    ).toEqual({
      sanitizedMetaUrl:
        'postgres://postgres@/juicefs?host=/var/run/postgresql&max_open_conns=4&max_idle_conns=1&max_idle_time=60',
      extraEnv: { META_PASSWORD: 'sock@pw' }
    });

    expect(
      buildJuicefsCommandCredentials({
        metaUrl: 'sqlite3:///var/lib/juicefs/meta.db',
        accessKey: '',
        secretKey: ''
      })
    ).toEqual({
      sanitizedMetaUrl: 'sqlite3:///var/lib/juicefs/meta.db',
      extraEnv: undefined
    });
  });

  it('formats once, locks mountpoint to 0500 before mount, sets quota/0755, and keeps credentials out of argv', async () => {
    const mountPath = join(mountRoot, VOLUME_NAME);
    fetchMock
      .mockResolvedValueOnce(volumeResponse(404))
      .mockResolvedValueOnce(volumeResponse(201))
      .mockResolvedValueOnce(volumeResponse(200));
    const driver = new DockerVolumeDriver({ mountRoot, runCommand });

    await expect(
      driver.ensure({ claimName: VOLUME_NAME, deploymentId: DEPLOYMENT_ID })
    ).resolves.toEqual({ claimName: VOLUME_NAME, created: true });

    // Second ensure reuses cached formatPromise and existing mount
    fsMocks.readFile.mockResolvedValue(`JuiceFS:sandbox ${mountPath} fuse.juicefs rw 0 0\n`);
    await expect(
      driver.ensure({ claimName: VOLUME_NAME, deploymentId: DEPLOYMENT_ID, storageSize: '2Gi' })
    ).resolves.toEqual({ claimName: VOLUME_NAME, created: false });

    const expectedEnv = {
      META_PASSWORD: 'test',
      ACCESS_KEY: 'rustfsadmin',
      SECRET_KEY: 'super-secret-s3-key'
    };
    expect(runCommand.mock.calls.filter(([c]) => c.args[0] === 'format')).toHaveLength(1);
    expect(runCommand).toHaveBeenNthCalledWith(1, {
      bin: 'juicefs',
      args: [
        'format',
        '--no-update',
        '--storage',
        'minio',
        '--bucket',
        BUCKET_URL,
        '--trash-days',
        '0',
        SANITIZED_META_URL,
        'fastgpt-sandbox'
      ],
      env: expectedEnv
    });
    expect(runCommand).toHaveBeenNthCalledWith(2, {
      bin: 'juicefs',
      args: [
        'mount',
        '-d',
        '--hide-internal',
        '--prefix-internal',
        `--subdir=/workspaces/${VOLUME_NAME}`,
        '--buffer-size=64',
        '--cache-size=0',
        SANITIZED_META_URL,
        mountPath
      ],
      env: expectedEnv
    });
    expect(runCommand).toHaveBeenNthCalledWith(3, {
      bin: 'juicefs',
      args: [
        'quota',
        'set',
        SANITIZED_META_URL,
        '--path',
        `/workspaces/${VOLUME_NAME}`,
        '--capacity',
        '1',
        '--inodes',
        '200000'
      ],
      env: expectedEnv
    });

    // Verifies underlying host mountpoint is locked to root:root 0500 before mount, then 10001:10001 0755 after mount
    expect(fsMocks.chown).toHaveBeenNthCalledWith(1, mountPath, 0, 0);
    expect(fsMocks.chmod).toHaveBeenNthCalledWith(1, mountPath, 0o500);
    expect(fsMocks.chown).toHaveBeenNthCalledWith(2, mountPath, 10001, 10001);
    expect(fsMocks.chmod).toHaveBeenNthCalledWith(2, mountPath, 0o755);

    for (const [{ args }] of runCommand.mock.calls) {
      expect(args.join(' ')).not.toContain('juicefs:test');
      expect(args.join(' ')).not.toContain('super-secret-s3-key');
    }
  });

  it('unmounts a disconnected (ENOTCONN) FUSE mount before remounting', async () => {
    const mountPath = join(mountRoot, VOLUME_NAME);
    await mkdir(mountPath, { recursive: true });
    fetchMock.mockResolvedValueOnce(volumeResponse());
    fsMocks.readFile.mockResolvedValue(`JuiceFS:sandbox ${mountPath} fuse.juicefs rw 0 0\n`);
    fsMocks.stat.mockRejectedValueOnce(
      Object.assign(new Error('disconnected'), { code: 'ENOTCONN' })
    );

    await new DockerVolumeDriver({ mountRoot, runCommand }).ensure({
      claimName: VOLUME_NAME,
      deploymentId: DEPLOYMENT_ID
    });
    expect(runCommand).toHaveBeenNthCalledWith(1, { bin: 'umount', args: [mountPath] });
  });

  it('ignores the four --prefix-internal .jfs.* files on new workspace check, but rejects real leftover files and rolls back mount', async () => {
    const mountPath = join(mountRoot, VOLUME_NAME);
    await mkdir(mountPath, { recursive: true });
    for (const file of ['.jfs.accesslog', '.jfs.config', '.jfs.stats', '.jfs.trash']) {
      await writeFile(join(mountPath, file), 'virtual');
    }

    fetchMock.mockResolvedValueOnce(volumeResponse(404)).mockResolvedValueOnce(volumeResponse(201));
    const driver = new DockerVolumeDriver({ mountRoot, runCommand });
    await expect(
      driver.ensure({ claimName: VOLUME_NAME, deploymentId: DEPLOYMENT_ID })
    ).resolves.toMatchObject({ created: true });

    // Leftover tenant file (.config) on a brand-new Docker volume must abort and umount
    await writeFile(join(mountPath, '.config'), 'tenant-xdg-config');
    fetchMock.mockResolvedValueOnce(volumeResponse(404));
    await expect(
      driver.ensure({ claimName: VOLUME_NAME, deploymentId: DEPLOYMENT_ID })
    ).rejects.toThrow('non-empty');
    expect(runCommand).toHaveBeenLastCalledWith({ bin: 'umount', args: [mountPath] });
  });

  it('clears tenant entries via juicefs rmr, unmounts, deletes quota, and removes Docker volume only after storage cleanup succeeds', async () => {
    const mountPath = join(mountRoot, VOLUME_NAME);
    await mkdir(join(mountPath, '.config/pip'), { recursive: true });
    await writeFile(join(mountPath, '.config/pip/pip.conf'), 'secret-index');
    for (const file of ['.jfs.accesslog', '.jfs.config', '.jfs.stats', '.jfs.trash', 'user.txt']) {
      await writeFile(join(mountPath, file), 'content');
    }
    fsMocks.readFile.mockResolvedValue(`JuiceFS:sandbox ${mountPath} fuse.juicefs rw 0 0\n`);

    // 1. Container still references volume -> blocked before touching files
    fetchMock
      .mockResolvedValueOnce(volumeResponse())
      .mockResolvedValueOnce(new Response('[{"Id":"still-used"}]'));
    const driver = new DockerVolumeDriver({ mountRoot, runCommand });
    await expect(driver.remove(VOLUME_NAME, DEPLOYMENT_ID)).rejects.toThrow('still referenced');
    expect(runCommand).not.toHaveBeenCalled();

    // 2. Storage cleanup error -> retains Docker volume metadata for retry
    fetchMock.mockResolvedValueOnce(volumeResponse()).mockResolvedValueOnce(new Response('[]'));
    runCommand.mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(driver.remove(VOLUME_NAME, DEPLOYMENT_ID)).rejects.toThrow('storage unavailable');
    expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'DELETE')).toBe(false);

    // 3. Clean removal order: rmr -> umount -> quota delete -> rmdir -> DELETE /volumes/:name
    const steps: string[] = [];
    runCommand.mockImplementation(async ({ bin, args }) => {
      steps.push(bin === 'umount' ? 'umount' : `${args[0]}`);
      if (bin === 'juicefs' && args[0] === 'rmr') {
        expect(args[1]).toBe('--');
        for (const target of args.slice(2)) {
          await rm(target, { recursive: true, force: true });
        }
      }
      if (bin === 'umount') {
        // Simulate FUSE disappearing so rmdir succeeds on empty host dir
        for (const virtualFile of ['.jfs.accesslog', '.jfs.config', '.jfs.stats', '.jfs.trash']) {
          await rm(join(mountPath, virtualFile), { force: true });
        }
      }
    });
    fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
      if (options?.method === 'DELETE') {
        steps.push('docker-delete');
        return new Response(null, { status: 204 });
      }
      return url.includes('/containers/') ? new Response('[]') : volumeResponse();
    });

    await driver.remove(VOLUME_NAME, DEPLOYMENT_ID);
    expect(steps).toEqual(['rmr', 'umount', 'quota', 'docker-delete']);

    const rmrArgs = runCommand.mock.calls.find(([c]) => c.args[0] === 'rmr')?.[0].args.slice(2);
    expect(rmrArgs?.sort()).toEqual(
      [join(mountPath, '.config'), join(mountPath, 'user.txt')].sort()
    );
    await expect(readdir(mountRoot)).resolves.toEqual([]);
  });

  it('unmounts residual local FUSE without wiping remote JuiceFS data when Docker volume is 404', async () => {
    const mountPath = join(mountRoot, VOLUME_NAME);
    await mkdir(mountPath, { recursive: true });
    fetchMock.mockResolvedValueOnce(volumeResponse(404));
    fsMocks.readFile.mockResolvedValue(`JuiceFS:sandbox ${mountPath} fuse.juicefs rw 0 0\n`);

    await new DockerVolumeDriver({ mountRoot, runCommand }).remove(VOLUME_NAME, DEPLOYMENT_ID);

    expect(runCommand).toHaveBeenCalledTimes(1);
    expect(runCommand).toHaveBeenCalledWith({ bin: 'umount', args: [mountPath] });
  });

  it('serializes concurrent ensure calls for the same volume and enforces deployment ownership', async () => {
    let exists = false;
    let releaseFormat: () => void = () => {};
    runCommand.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseFormat = resolve;
        })
    );
    fetchMock.mockImplementation(async (_url: string, options?: RequestInit) => {
      if (options?.method === 'POST') {
        exists = true;
        return volumeResponse(201);
      }
      return volumeResponse(exists ? 200 : 404);
    });

    const driver = new DockerVolumeDriver({ mountRoot, runCommand });
    const first = driver.ensure({ claimName: VOLUME_NAME, deploymentId: DEPLOYMENT_ID });
    const second = driver.ensure({ claimName: VOLUME_NAME, deploymentId: DEPLOYMENT_ID });
    await vi.waitFor(() => expect(runCommand).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    releaseFormat();

    expect(await Promise.all([first, second])).toEqual([
      { claimName: VOLUME_NAME, created: true },
      { claimName: VOLUME_NAME, created: false }
    ]);

    // Ownership mismatch across ensure, unmount, remove
    fetchMock.mockImplementation(async () =>
      volumeResponse(200, { ...OWNER_LABELS, 'fastgpt.deployment': 'f'.repeat(32) })
    );
    await expect(
      driver.ensure({ claimName: VOLUME_NAME, deploymentId: DEPLOYMENT_ID })
    ).rejects.toBeInstanceOf(VolumeOwnershipError);
    await expect(driver.unmount(VOLUME_NAME, DEPLOYMENT_ID)).rejects.toBeInstanceOf(
      VolumeOwnershipError
    );
    await expect(driver.remove(VOLUME_NAME, DEPLOYMENT_ID)).rejects.toBeInstanceOf(
      VolumeOwnershipError
    );
  });

  it('filters list by exact deployment labels and redacts credentials without redacting plain bucket URLs', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          Volumes: [
            { Name: VOLUME_NAME, Labels: OWNER_LABELS },
            { Name: 'unlabelled', Labels: null },
            {
              Name: 'other',
              Labels: {
                ...OWNER_LABELS,
                'fastgpt.sandbox.claim': 'other',
                'fastgpt.deployment': 'other'
              }
            }
          ]
        })
      )
    );
    const driver = new DockerVolumeDriver({ mountRoot, runCommand });
    await expect(driver.list(DEPLOYMENT_ID)).resolves.toEqual([VOLUME_NAME]);

    fetchMock.mockResolvedValueOnce(volumeResponse(404));
    runCommand.mockRejectedValueOnce(
      new Error(
        `Command failed: juicefs format --bucket ${BUCKET_URL} ${META_URL} (ak=rustfsadmin sk=super-secret-s3-key pw=test)`
      )
    );
    let caughtMessage = '';
    try {
      await driver.ensure({ claimName: VOLUME_NAME, deploymentId: DEPLOYMENT_ID });
    } catch (error) {
      caughtMessage = (error as Error).message;
    }
    expect(caughtMessage).toContain(BUCKET_URL);
    expect(caughtMessage).not.toContain('super-secret-s3-key');
    expect(caughtMessage).not.toContain('rustfsadmin');
    expect(caughtMessage).not.toContain('juicefs:test');
    expect(caughtMessage).not.toContain('pw=test');
    expect(caughtMessage).toContain('[REDACTED]');
  });
});
