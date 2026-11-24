import pg from 'pg';
import { ObjectIdSchema } from '@fastgpt/global/common/type/mongo';
import { delay } from '@fastgpt/global/common/system/utils';
import {
  DATASET_VECTOR_INDEX_MIN_ROWS,
  DATASET_VECTOR_INDEX_DROP_ROWS
} from '@fastgpt/global/core/dataset/vectorData/constants';
import { DatasetVectorTableName, OPENGAUSS_ADDRESS } from '../constants';
import { getLogger, LogCategories } from '../../logger';

type Scope = { teamId: string; datasetId: string };
const maintenanceLock = 41823001;
const logger = getLogger(LogCategories.INFRA.VECTOR);

/** 各节点的建图、删除和迁移清理共用一个数据库会话锁。 */
export const withOpenGaussIndexSession = async <T>(
  run: (client: pg.Client) => Promise<T>,
  signal?: AbortSignal
): Promise<T> => {
  const client = new pg.Client({
    connectionString: OPENGAUSS_ADDRESS,
    application_name: 'fastgpt-opengauss-dataset-index',
    connectionTimeoutMillis: 30000,
    query_timeout: 0,
    statement_timeout: 0
  });
  client.on('error', (error) =>
    logger.warn('openGauss index maintenance connection failed', {
      message: error.message
    })
  );
  let closing: Promise<void> | undefined;
  const close = () => (closing ??= client.end());
  const abort = () => void close().catch(() => {});
  signal?.addEventListener('abort', abort, { once: true });
  try {
    signal?.throwIfAborted();
    await client.connect();
    while (true) {
      signal?.throwIfAborted();
      const { rows } = await client.query<{ locked: boolean }>(
        'SELECT pg_try_advisory_lock($1::bigint) AS locked',
        [maintenanceLock]
      );
      if (rows[0].locked) break;
      await delay(1000);
    }
    signal?.throwIfAborted();
    return await run(client);
  } finally {
    signal?.removeEventListener('abort', abort);
    await close();
  }
};

/** 检查索引的表、访问方法、列和谓词，避免重用或删除同名自建索引。 */
export const readOpenGaussHnswIndex = async ({
  client,
  schema,
  indexName,
  predicate = ''
}: {
  client: Pick<pg.Client, 'query'>;
  schema: string;
  indexName: string;
  predicate?: string;
}) => {
  const { rows } = await client.query<{
    table_name: string;
    table_schema: string;
    method: string;
    opclass: string;
    column_name: string;
    columns: number;
    no_expression: boolean;
    predicate: string | null;
    valid: boolean;
    ready: boolean;
  }>(
    `SELECT tbl.relname AS table_name, tn.nspname AS table_schema, am.amname AS method,
            op.opcname AS opclass, a.attname AS column_name, i.indnatts AS columns,
            i.indexprs IS NULL AS no_expression, pg_get_expr(i.indpred, i.indrelid) AS predicate,
            i.indisvalid AS valid, i.indisready AS ready
     FROM pg_class idx JOIN pg_namespace n ON n.oid = idx.relnamespace
     LEFT JOIN pg_index i ON i.indexrelid = idx.oid
     LEFT JOIN pg_class tbl ON tbl.oid = i.indrelid
     LEFT JOIN pg_namespace tn ON tn.oid = tbl.relnamespace
     LEFT JOIN pg_am am ON am.oid = idx.relam
     LEFT JOIN pg_opclass op ON op.oid = i.indclass[0]
     LEFT JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
     WHERE n.nspname = $1 AND idx.relname = $2`,
    [schema, indexName]
  );
  const index = rows[0];
  if (!index) return;
  // 保留字符串常量和未知标识符，避免误把其他谓词认成 FastGPT 的索引。
  const normalize = (value: string) =>
    value.replace(/'(?:[^']|'')*'|::(?:text|character varying)|[\s()]/g, (token) =>
      token.startsWith("'") ? token : ''
    );
  if (
    index.table_schema !== schema ||
    index.table_name !== DatasetVectorTableName ||
    index.method !== 'hnsw' ||
    index.opclass !== 'vector_ip_ops' ||
    index.column_name !== 'vector' ||
    index.columns !== 1 ||
    !index.no_expression ||
    normalize(index.predicate ?? '') !== normalize(predicate)
  ) {
    throw new Error(`Refusing to reuse or remove mismatched openGauss index: ${indexName}`);
  }
  return index;
};

const maintainOpenGaussDatasetIndex = ({
  teamId,
  datasetId,
  allowCreate = true,
  removeOnly = false,
  onBuilding,
  onRemoving
}: Scope & {
  allowCreate?: boolean;
  removeOnly?: boolean;
  onBuilding?: () => Promise<boolean | void>;
  onRemoving?: () => Promise<void>;
}) =>
  withOpenGaussIndexSession(async (client) => {
    const indexName = `${DatasetVectorTableName}_og_${ObjectIdSchema.parse(datasetId)}`;
    const {
      rows: [{ schema }]
    } = await client.query<{ schema: string }>('SELECT current_schema() AS schema');
    const qualified = (name: string) =>
      `${pg.escapeIdentifier(schema)}.${pg.escapeIdentifier(name)}`;
    const predicate = `team_id = ${pg.escapeLiteral(teamId)} AND dataset_id = ${pg.escapeLiteral(datasetId)}`;
    const readIndex = () => readOpenGaussHnswIndex({ client, schema, indexName, predicate });
    const existing = await readIndex();
    const dropIndex = async () => {
      await onRemoving?.();
      await client.query(`DROP INDEX CONCURRENTLY ${qualified(indexName)}`);
      if (await readIndex()) throw new Error(`openGauss index still exists: ${indexName}`);
    };
    if (removeOnly) {
      if (existing) await dropIndex();
      return { indexState: 'none' as const, created: false };
    }
    const {
      rows: [{ count }]
    } = await client.query<{ count: string }>(
      `SELECT count(*) FROM ${qualified(DatasetVectorTableName)} WHERE ${predicate}`
    );
    const rows = Number(count);
    if (existing?.valid && existing.ready && rows >= DATASET_VECTOR_INDEX_DROP_ROWS) {
      return { indexState: 'ready' as const, created: false };
    }
    if (existing) await dropIndex();
    if (!allowCreate || rows <= DATASET_VECTOR_INDEX_MIN_ROWS || (await onBuilding?.()) === false) {
      return { indexState: 'none' as const, created: false };
    }
    await client.query(
      `CREATE INDEX CONCURRENTLY ${pg.escapeIdentifier(indexName)} ON ${qualified(DatasetVectorTableName)}
       USING hnsw (vector vector_ip_ops) WITH (m = 32, ef_construction = 256) WHERE ${predicate}`
    );
    const built = await readIndex();
    if (!built?.valid || !built.ready)
      throw new Error(`openGauss index is not ready: ${indexName}`);
    return { indexState: 'ready' as const, created: true };
  });

/** 仅在队列内重查真实行数并维护指定知识库的 FP32 HNSW。 */
export const ensureOpenGaussDatasetIndex = maintainOpenGaussDatasetIndex;

/** 物理删除知识库前等待在途建图，并回收其局部索引。 */
export const removeOpenGaussDatasetIndex = async (scope: Scope) => {
  await maintainOpenGaussDatasetIndex({ ...scope, removeOnly: true });
};
