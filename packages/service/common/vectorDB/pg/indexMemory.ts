import type { Client } from 'pg';

/**
 * 按行数、维度估算 FP16 建图预算，仅调整本次独立 DDL 会话。
 * 估算不超过 2 GiB 时直接采用；超过时优先保留足够的 PG 原预算，否则设置为 2 GiB。
 * 不读取系统资源文件、不修改并行度；估算包含图结构的经验开销，不保证完全在内存中构建。
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
  const { rows: settings } = await client.query<{ memory_bytes: string }>(
    `SELECT pg_size_bytes(current_setting('maintenance_work_mem'))::text AS memory_bytes`
  );
  const configuredBytes = Number(settings[0].memory_bytes);
  // 每条计入 FP16 向量、图连接和分配开销，留 20% 余量，按 16 MiB 向上取整。
  const estimatedMB = Math.max(
    64,
    Math.ceil((rows * (dimensions * 2 + 2048) * 1.2) / MiB / 16) * 16
  );
  const memory = (() => {
    // 恰好 2 GiB 也采用估算值；即使原 PG 预算更小，也按此规则设置。
    if (estimatedMB <= 2048) return { source: 'estimate' as const, budgetMB: estimatedMB };
    if (estimatedMB * MiB <= configuredBytes) {
      return { source: 'postgres' as const, budgetMB: configuredBytes / MiB };
    }
    return { source: 'capped' as const, budgetMB: 2048 };
  })();

  // CREATE INDEX CONCURRENTLY 不在事务内；false 为会话级设置，关闭连接后恢复。
  if (memory.source !== 'postgres') {
    await client.query(`SELECT set_config('maintenance_work_mem', $1, false)`, [
      `${memory.budgetMB}MB`
    ]);
  }
  return { estimatedMB, configuredMB: configuredBytes / MiB, ...memory };
};
