import pg from 'pg';
import { DatasetVectorTableName, PG_ADDRESS } from '@fastgpt/service/common/vectorDB/constants';
import { waitForPgIndexMaintenanceLock } from '@fastgpt/service/common/vectorDB/pg/datasetIndex';
import type { SystemMigrationContext } from '@/migration/registry';

/**
 * 在线清理旧版固定名称 vector_index：只接受当前向量表原始 vector/halfvec 列的全局内积 HNSW。
 * 与局部建图共用会话锁，重复执行和失败后的无效索引均可恢复；失去迁移 lease 时关闭 DDL 连接。
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
  // abort 与 finally 共用一次关闭，打断锁等待/DDL，并释放会话 advisory lock。
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
    // 允许等待在途建图；独立连接不受普通连接池的 60 秒 query_timeout 限制。
    await waitForPgIndexMaintenanceLock({ client, signal: context.signal });
    await context.assertActive();
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

    await context.assertActive();
    context.signal.throwIfAborted();
    // 不在事务中执行，不使用 CASCADE；查询与写入可继续，冲突的旧事务可能使 DROP 等待。
    await client.query(`DROP INDEX CONCURRENTLY IF EXISTS ${qualifiedIndex}`);
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
