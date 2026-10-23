import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configurePgIndexMemory } from '@fastgpt/service/common/vectorDB/pg/indexMemory';

const MiB = 1024 ** 2;
const GiB = 1024 ** 3;
const files = new Map<string, string>();
let configuredBytes: number;
let parallelWorkers: number;
let canReadFiles: boolean;
let shmUsed: number;
const query = vi.fn();
const configure = () =>
  configurePgIndexMemory({ client: { query }, rows: 250000, dimensions: 1536 });

beforeEach(() => {
  configuredBytes = 64 * MiB;
  parallelWorkers = 2;
  canReadFiles = true;
  shmUsed = MiB;
  files.clear();
  files.set(
    '/proc/meminfo',
    `MemTotal: ${(32 * GiB) / 1024} kB\nMemAvailable: ${(24 * GiB) / 1024} kB\n`
  );
  files.set('/proc/self/cgroup', '0::/\n');
  files.set(
    '/proc/mounts',
    'cgroup /sys/fs/cgroup cgroup2 ro 0 0\nshm /dev/shm tmpfs rw,size=8g 0 0\n'
  );
  files.set('/sys/fs/cgroup/memory.max', String(16 * GiB));
  files.set('/sys/fs/cgroup/memory.current', String(4 * GiB));
  files.set('/sys/fs/cgroup/memory.stat', `inactive_file ${GiB}\n`);
  query.mockReset().mockImplementation(async (sql: string, params?: unknown[]) => {
    if (sql.includes('current_setting'))
      return {
        rows: [
          {
            memory_bytes: String(configuredBytes),
            parallel_workers: parallelWorkers,
            can_read_files: canReadFiles
          }
        ]
      };
    if (sql.includes('pg_read_file'))
      return {
        rows: (params![0] as string[]).map((path) => ({ path, content: files.get(path) ?? null }))
      };
    if (sql.includes('pg_ls_dir')) return { rows: [{ used_bytes: String(shmUsed) }] };
    if (sql.includes('set_config')) return { rows: [] };
    throw new Error(`Unexpected SQL: ${sql}`);
  });
});

describe('configurePgIndexMemory', () => {
  it('uses the PG cgroup quota and sets only the build session', async () => {
    const plan = await configure();
    expect(plan).toMatchObject({
      source: 'detected',
      totalBytes: 16 * GiB,
      availableBytes: 13 * GiB,
      estimatedMB: 1840,
      budgetMB: 1840,
      parallelWorkers: 2
    });
    expect(query.mock.calls.find(([sql]) => sql.includes('set_config'))).toEqual([
      expect.stringContaining("set_config('maintenance_work_mem', $1, false)"),
      ['1840MB', '2']
    ]);
  });

  it('caps large graphs at the available budget rather than claiming they will fit', async () => {
    const plan = await configurePgIndexMemory({
      client: { query },
      rows: 1000000,
      dimensions: 1536
    });
    expect(plan).toMatchObject({ source: 'detected', budgetMB: 4096 });
    expect(plan.estimatedMB).toBeGreaterThan(plan.budgetMB);
  });

  it('honors tighter ancestor cgroups even when the leaf is unlimited', async () => {
    files.set('/proc/self/cgroup', '0::/jobs/pg\n');
    files.set('/sys/fs/cgroup/jobs/memory.max', String(8 * GiB));
    files.set('/sys/fs/cgroup/jobs/memory.current', String(4 * GiB));
    files.set('/sys/fs/cgroup/jobs/pg/memory.max', 'max\n');
    expect(await configure()).toMatchObject({
      source: 'detected',
      totalBytes: 8 * GiB,
      availableBytes: 4 * GiB,
      budgetMB: 1638
    });
  });

  it('counts cold reclaimable file cache without treating active memory as available', async () => {
    files.set('/sys/fs/cgroup/memory.current', String(16 * GiB));
    files.set(
      '/sys/fs/cgroup/memory.stat',
      `inactive_file ${4 * GiB}\nactive_file ${4 * GiB}\nshmem ${4 * GiB}\n`
    );
    expect(await configure()).toMatchObject({
      source: 'detected',
      availableBytes: 4 * GiB,
      budgetMB: 1228
    });
  });

  it.each([String(16 * GiB), '9223372036854771712'])(
    'supports cgroup v1 limits (%s)',
    async (limit) => {
      files.set('/proc/self/cgroup', '5:cpu:/\n7:memory:/pg\n');
      files.set(
        '/proc/mounts',
        'cgroup /sys/fs/cgroup/memory cgroup rw,memory 0 0\nshm /dev/shm tmpfs rw,size=8g 0 0\n'
      );
      files.set('/sys/fs/cgroup/memory/pg/memory.limit_in_bytes', limit);
      files.set('/sys/fs/cgroup/memory/pg/memory.usage_in_bytes', String(4 * GiB));
      files.set('/sys/fs/cgroup/memory/pg/memory.stat', `total_inactive_file ${GiB}\n`);
      expect(await configure()).toMatchObject({ source: 'detected', budgetMB: 1840 });
    }
  );

  it('limits even a large host to an 8 GiB build budget', async () => {
    files.set('/sys/fs/cgroup/memory.max', 'max');
    files.set(
      '/proc/meminfo',
      `MemTotal: ${(128 * GiB) / 1024} kB\nMemAvailable: ${(100 * GiB) / 1024} kB\n`
    );
    expect(
      await configurePgIndexMemory({ client: { query }, rows: 10000000, dimensions: 1536 })
    ).toMatchObject({ source: 'detected', budgetMB: 8192, parallelWorkers: 0 });
  });

  it('defers a build under memory pressure instead of falling back to an unsafe larger budget', async () => {
    configuredBytes = 4 * GiB;
    files.set('/sys/fs/cgroup/memory.current', String(16 * GiB));
    files.set('/sys/fs/cgroup/memory.stat', 'inactive_file 0\n');
    await expect(configure()).rejects.toThrow('Insufficient available PG memory');
    expect(query.mock.calls.some(([sql]) => sql.includes('set_config'))).toBe(false);
  });

  it.each(['size=8589934592', 'size=8388608k', 'size=8192m', 'size=8g', 'size=1t'])(
    'recognizes shared memory capacity in kernel mount options: %s',
    async (size) => {
      files.set(
        '/proc/mounts',
        `cgroup /sys/fs/cgroup cgroup2 ro 0 0\nshm /dev/shm tmpfs rw,${size},inode64 0 0\n`
      );
      expect(await configure()).toMatchObject({ parallelWorkers: 2 });
    }
  );

  it.each(['small', 'occupied', 'unknown', 'denied', 'invalid'])(
    'uses serial building when shared memory is %s',
    async (state) => {
      if (state === 'small')
        files.set(
          '/proc/mounts',
          'cgroup /sys/fs/cgroup cgroup2 ro 0 0\nshm /dev/shm tmpfs rw,size=64m 0 0\n'
        );
      if (state === 'occupied') shmUsed = 8 * GiB;
      if (state === 'unknown') files.set('/proc/mounts', 'cgroup /sys/fs/cgroup cgroup2 ro 0 0\n');
      if (state === 'invalid') shmUsed = NaN;
      if (state === 'denied') {
        const execute = query.getMockImplementation()!;
        query.mockImplementation(async (sql, params) => {
          if (sql.includes('pg_ls_dir')) throw new Error('permission denied');
          return execute(sql, params);
        });
      }
      expect(await configure()).toMatchObject({
        source: 'detected',
        budgetMB: 1840,
        parallelWorkers: 0
      });
    }
  );

  it('keeps an explicitly serial PG configuration and avoids checking shared memory usage', async () => {
    parallelWorkers = 0;
    expect(await configure()).toMatchObject({ parallelWorkers: 0 });
    expect(query.mock.calls.some(([sql]) => sql.includes('pg_ls_dir'))).toBe(false);
  });

  it.each([
    ['/proc/meminfo', ''],
    ['/proc/meminfo', 'MemTotal: 1024 kB\nMemAvailable: 2048 kB'],
    ['/proc/self/cgroup', ''],
    ['/proc/self/cgroup', '0::/../outside'],
    ['/proc/self/cgroup', `0::/${Array(33).fill('deep').join('/')}`],
    ['/sys/fs/cgroup/memory.max', ''],
    ['/sys/fs/cgroup/memory.max', '0'],
    ['/sys/fs/cgroup/memory.max', 'invalid'],
    ['/sys/fs/cgroup/memory.current', ''],
    ['/sys/fs/cgroup/memory.current', '-1']
  ])(
    'retains the existing PG budget when resource information is unavailable: %s %s',
    async (path, content) => {
      files.set(path, content);
      expect(await configure()).toMatchObject({
        source: 'postgres',
        budgetMB: 64,
        parallelWorkers: 0,
        detectionError: expect.any(String)
      });
      expect(
        query.mock.calls.some(([sql]) => sql.includes("set_config('maintenance_work_mem'"))
      ).toBe(false);
    }
  );

  it('needs no extra file privileges and keeps the configured budget on managed PG', async () => {
    canReadFiles = false;
    expect(await configure()).toMatchObject({
      source: 'postgres',
      budgetMB: 64,
      detectionError: 'PG role cannot read server resource files'
    });
    expect(query.mock.calls.some(([sql]) => sql.includes('FROM unnest'))).toBe(false);
    expect(
      query.mock.calls.some(([sql]) => sql.includes("set_config('maintenance_work_mem'"))
    ).toBe(false);
  });

  it('retains the database budget when file access is granted but restricted to other paths', async () => {
    const execute = query.getMockImplementation()!;
    query.mockImplementation(async (sql, params) => {
      if (sql.includes('FROM unnest'))
        throw new Error('permission denied for function pg_read_file');
      return execute(sql, params);
    });
    expect(await configure()).toMatchObject({
      source: 'postgres',
      budgetMB: 64,
      detectionError: 'permission denied for function pg_read_file'
    });
    expect(
      query.mock.calls.some(([sql]) => sql.includes("set_config('maintenance_work_mem'"))
    ).toBe(false);
  });

  it('propagates session configuration failures instead of silently using an unknown budget', async () => {
    const execute = query.getMockImplementation()!;
    query.mockImplementation(async (sql, params) => {
      if (sql.includes('set_config')) throw new Error('connection lost');
      return execute(sql, params);
    });
    await expect(configure()).rejects.toThrow('connection lost');
  });
});
