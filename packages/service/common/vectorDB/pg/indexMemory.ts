import type { Client } from 'pg';

/**
 * 按当前知识库估算 FP16 建图预算，只修改独立 DDL 会话。
 * 资源取自 PG 所在 Linux / cgroup；无读取权限时沿用 PG 预算，不能用应用节点内存代替。
 * 预算为保守估算，仍可能转磁盘构建；共享内存不足或未知时改为串行，避免要求用户调整 /dev/shm。
 */
export const configurePgIndexMemory = async ({
  client,
  rows,
  dimensions
}: {
  client: Pick<Client, 'query'>;
  rows: number;
  dimensions: number;
}) => {
  const MiB = 1024 ** 2;
  const { rows: settings } = await client.query<{
    memory_bytes: string;
    parallel_workers: number;
    can_read_files: boolean;
  }>(
    `SELECT pg_size_bytes(current_setting('maintenance_work_mem'))::text AS memory_bytes,
            current_setting('max_parallel_maintenance_workers')::int AS parallel_workers,
            has_function_privilege('pg_catalog.pg_read_file(text,bigint,bigint,boolean)', 'EXECUTE') AS can_read_files`
  );
  const configured = settings[0];
  // 每条包含 FP16 向量、图连接和分配开销，再留 50% 余量；不是 PG 的精确内存承诺。
  const estimatedMB = Math.max(
    64,
    Math.ceil((rows * (dimensions * 2 + 2048) * 1.5) / MiB / 16) * 16
  );

  const resources = await (async () => {
    if (!configured.can_read_files) throw new Error('PG role cannot read server resource files');
    /** 只读取固定系统文件及当前 cgroup 的祖先目录，不安装扩展或申请额外权限。 */
    const readFiles = async (paths: string[]) => {
      const { rows } = await client.query<{ path: string; content: string | null }>(
        `SELECT path, pg_catalog.pg_read_file(path, 0, 65536, true) AS content
         FROM unnest($1::text[]) AS files(path)`,
        [paths]
      );
      return new Map(rows.map(({ path, content }) => [path, content]));
    };
    const files = await readFiles(['/proc/meminfo', '/proc/self/cgroup', '/proc/mounts']);
    const meminfo = files.get('/proc/meminfo') ?? '';
    const hostTotal = Number(meminfo.match(/^MemTotal:\s+(\d+)\s+kB$/m)?.[1]) * 1024;
    const hostAvailable = Number(meminfo.match(/^MemAvailable:\s+(\d+)\s+kB$/m)?.[1]) * 1024;
    if (!(hostTotal > 0) || !(hostAvailable >= 0) || hostAvailable > hostTotal) {
      throw new Error('PG host memory information unavailable');
    }

    // 宿主机 MemAvailable 可能大于容器配额，必须同时检查当前 cgroup 和可见祖先的限制。
    const memberships = (files.get('/proc/self/cgroup') ?? '')
      .trim()
      .split('\n')
      .map((line) => line.split(':'));
    const mounts = (files.get('/proc/mounts') ?? '').split('\n').map((line) => line.split(' '));
    const v2 = memberships.find(([hierarchy, controllers]) => hierarchy === '0' && !controllers);
    const group =
      v2 ?? memberships.find(([, controllers]) => controllers?.split(',').includes('memory'));
    const mount = mounts.find(([, , type, options]) =>
      v2 ? type === 'cgroup2' : type === 'cgroup' && options?.split(',').includes('memory')
    );
    const groupPath = group?.slice(2).join(':');
    const root = mount?.[1];
    const parts = groupPath?.split('/').filter(Boolean);
    if (
      !root?.startsWith('/') ||
      !groupPath?.startsWith('/') ||
      !parts ||
      parts.length > 32 ||
      parts.some((part) => part === '.' || part === '..') ||
      root.split('/').some((part) => part === '.' || part === '..')
    ) {
      throw new Error('PG memory cgroup information unavailable');
    }
    const directories = Array.from({ length: parts.length + 1 }, (_, i) =>
      [root, ...parts.slice(0, i)].join('/')
    );
    const limitFile = v2 ? 'memory.max' : 'memory.limit_in_bytes';
    const usageFile = v2 ? 'memory.current' : 'memory.usage_in_bytes';
    const limits = await readFiles(
      directories.flatMap((dir) => [
        `${dir}/${limitFile}`,
        `${dir}/${usageFile}`,
        `${dir}/memory.stat`
      ])
    );
    let totalBytes = hostTotal;
    let availableBytes = hostAvailable;
    let readable = false;
    for (const dir of directories) {
      const limit = limits.get(`${dir}/${limitFile}`)?.trim();
      if (!limit) continue;
      readable = true;
      if (limit === 'max') continue;
      const maximum = Number(limit);
      if (!Number.isFinite(maximum) || maximum <= 0)
        throw new Error('Invalid PG memory cgroup limit');
      const usageText = limits.get(`${dir}/${usageFile}`)?.trim();
      const used = usageText ? Number(usageText) : NaN;
      if (!Number.isFinite(used) || used < 0) throw new Error('PG memory cgroup usage unavailable');
      // 可回收的冷文件缓存不应使任务永久等待；不把共享缓冲区或活跃匿名内存当作可用量。
      const stat = limits.get(`${dir}/memory.stat`) ?? '';
      const inactive = Number(
        (v2
          ? stat.match(/^inactive_file (\d+)$/m)
          : stat.match(/^total_inactive_file (\d+)$/m))?.[1] ?? 0
      );
      totalBytes = Math.min(totalBytes, maximum);
      availableBytes = Math.min(
        availableBytes,
        Math.max(0, maximum - used + Math.min(used, inactive))
      );
    }
    if (!readable) throw new Error('PG memory cgroup limits unavailable');

    // POSIX 共享内存文件的逻辑大小给出保守占用估算；无法确认余量时不用并行建图。
    const shm = mounts.find(([, path, type]) => path === '/dev/shm' && type === 'tmpfs');
    const size = shm?.[3]?.match(/(?:^|,)size=(\d+)([kmgt]?)(?:,|$)/i);
    const shmCapacity = size
      ? Number(size[1]) * 1024 ** (size[2] ? 'kmgt'.indexOf(size[2].toLowerCase()) + 1 : 0)
      : 0;
    const shmAvailable = await (async () => {
      if (!shmCapacity || configured.parallel_workers === 0) return 0;
      const { rows } = await client.query<{ used_bytes: string }>(
        `SELECT COALESCE(sum(ceil((pg_stat_file('/dev/shm/' || name, true)).size::numeric / 4096) * 4096), 0)::text AS used_bytes
         FROM pg_ls_dir('/dev/shm', true, false) AS name`
      );
      const used = Number(rows[0].used_bytes);
      return Number.isFinite(used) && used >= 0 ? Math.max(0, shmCapacity - used) : 0;
    })().catch(() => 0);
    return { totalBytes, availableBytes, shmAvailable };
  })().catch((error: unknown) => ({
    detectionError:
      error instanceof Error ? error.message.slice(0, 200) : 'PG memory detection failed'
  }));

  if ('detectionError' in resources) {
    // 无法探测时保留 DBA 给定的内存上限，但不用未经核实的 POSIX 共享内存。
    if (configured.parallel_workers > 0) {
      await client.query("SELECT set_config('max_parallel_maintenance_workers', '0', false)");
    }
    return {
      source: 'postgres' as const,
      estimatedMB,
      budgetMB: Number(configured.memory_bytes) / MiB,
      parallelWorkers: 0,
      ...resources
    };
  }

  // 至少保留 512 MiB / 总量的 10%；预算不超过总量 25%、剩余可用量的一半和 8 GiB。
  const reserve = Math.max(512 * MiB, resources.totalBytes * 0.1);
  const ceilingMB = Math.floor(
    Math.min(resources.totalBytes * 0.25, (resources.availableBytes - reserve) * 0.5, 8192 * MiB) /
      MiB
  );
  if (ceilingMB < 64)
    throw new Error('Insufficient available PG memory for index build; retry later');
  const budgetMB = Math.min(estimatedMB, ceilingMB);
  const parallelWorkers =
    resources.shmAvailable * 0.75 >= (budgetMB + 64) * MiB ? configured.parallel_workers : 0;
  // false 表示会话级设置；CREATE INDEX CONCURRENTLY 不能放在事务内，连接关闭后自动恢复。
  await client.query(
    `SELECT set_config('maintenance_work_mem', $1, false),
            set_config('max_parallel_maintenance_workers', $2, false)`,
    [`${budgetMB}MB`, String(parallelWorkers)]
  );
  return { source: 'detected' as const, estimatedMB, budgetMB, parallelWorkers, ...resources };
};
