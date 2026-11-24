import pg from 'pg';
import { DatasetVectorTableName, PG_ADDRESS } from '@fastgpt/service/common/vectorDB/constants';
import { delay } from '@fastgpt/global/common/system/utils';
import type { SystemMigrationContext } from '@/migration/registry';

/**
 * 在线清理旧版固定名称 vector_index：只接受当前向量表原始 vector/halfvec 列的全局内积 HNSW。
 * 由迁移 lease 管理，不占用局部索引维护锁；重复执行和失败后的无效索引均可恢复。
 * 失去迁移 lease 时关闭 DDL 连接；PG 锁冲突时短暂退让，避免等待中的 DROP 与建图形成死锁。
 * 普通索引、局部索引及同名但定义不同的自建索引保持不变，归属不匹配时终止迁移以便排查。
 */
export const removeLegacyPgVectorIndex = async (
  context: Pick<SystemMigrationContext, 'assertActive' | 'signal' | 'logger'>
) => {
  context.signal.throwIfAborted();
  await context.assertActive();
  context.signal.throwIfAborted();
  const client = new pg.Client({
    connectionString: PG_ADDRESS,
    application_name: 'fastgpt-legacy-vector-index-cleanup',
    connectionTimeoutMillis: 30000,
    query_timeout: 0,
    statement_timeout: 0,
    keepAlive: true
  });
  client.on('error', (error) =>
    context.logger.warn('Legacy PG index cleanup connection error', { message: error.message })
  );
  // abort 与 finally 共用一次关闭，打断 PG 内部锁等待或正在执行的 DDL。
  let closing: Promise<void> | undefined;
  const close = () =>
    (closing ??= client.end().catch((error: Error) =>
      context.logger.warn('Failed to close legacy PG index cleanup connection', {
        message: error.message
      })
    ));
  const abort = () => {
    void close();
  };
  context.signal.addEventListener('abort', abort, { once: true });

  try {
    await client.connect();
    context.signal.throwIfAborted();
    const { rows: tables } = await client.query<{ schema: string; vector_type: string }>(
      `SELECT n.nspname AS schema, t.typname AS vector_type
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'vector'
       JOIN pg_type t ON t.oid = a.atttypid
       WHERE c.oid = to_regclass($1)`,
      [DatasetVectorTableName]
    );
    const table = tables[0];
    if (!table) return;
    const qualifiedTable = `${pg.escapeIdentifier(table.schema)}.${pg.escapeIdentifier(DatasetVectorTableName)}`;
    const qualifiedIndex = `${pg.escapeIdentifier(table.schema)}.${pg.escapeIdentifier('vector_index')}`;
    const { rows: indexes } = await client.query<{
      on_table: boolean;
      method: string;
      opclass: string;
      column_name: string;
      columns: number;
      no_expression: boolean;
      no_predicate: boolean;
    }>(
      `SELECT i.indrelid = to_regclass($2) AS on_table, am.amname AS method,
              op.opcname AS opclass, a.attname AS column_name, i.indnatts AS columns,
              i.indexprs IS NULL AS no_expression, i.indpred IS NULL AS no_predicate
       FROM pg_class c LEFT JOIN pg_index i ON i.indexrelid = c.oid
       LEFT JOIN pg_am am ON am.oid = c.relam
       LEFT JOIN pg_opclass op ON op.oid = i.indclass[0]
       LEFT JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
       WHERE c.oid = to_regclass($1)`,
      [qualifiedIndex, qualifiedTable]
    );
    const index = indexes[0];
    if (!index) return;
    if (
      !['vector', 'halfvec'].includes(table.vector_type) ||
      !index.on_table ||
      index.method !== 'hnsw' ||
      index.opclass !== `${table.vector_type}_ip_ops` ||
      index.column_name !== 'vector' ||
      index.columns !== 1 ||
      !index.no_expression ||
      !index.no_predicate
    ) {
      throw new Error(`Refusing to remove mismatched legacy PG index: ${qualifiedIndex}`);
    }

    // 不占用局部维护锁。DROP 等表锁时可能持有建图要等待的旧快照，短暂等锁后退出语句并退让。
    // 仅重试 PG 锁超时/死锁；权限、连接等实际故障仍交给迁移框架报告失败。
    await client.query("SET lock_timeout = '100ms'");
    let waitingLogged = false;
    while (true) {
      await context.assertActive();
      context.signal.throwIfAborted();
      try {
        await client.query(`DROP INDEX CONCURRENTLY IF EXISTS ${qualifiedIndex}`);
        break;
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !('code' in error) ||
          !['55P03', '40P01'].includes(String(error.code))
        ) {
          throw error;
        }
        context.signal.throwIfAborted();
        if (!waitingLogged) {
          context.logger.warn('Legacy PG index cleanup waiting for conflicting transactions', {
            indexName: qualifiedIndex,
            code: error.code
          });
          waitingLogged = true;
        }
        await delay(1000);
      }
    }
    const { rows: verification } = await client.query<{ removed: boolean }>(
      'SELECT to_regclass($1) IS NULL AS removed',
      [qualifiedIndex]
    );
    if (!verification[0]?.removed) {
      throw new Error(`Legacy PG vector index still exists after cleanup: ${qualifiedIndex}`);
    }
    context.logger.info('Legacy global PG HNSW index removed', { indexName: qualifiedIndex });
  } finally {
    context.signal.removeEventListener('abort', abort);
    await close();
  }
};
