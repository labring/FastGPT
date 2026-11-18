import {
  SQL_FULL_TEXT_ANALYZER_VERSION,
  SQL_FULL_TEXT_SCHEMA_VERSION
} from '@fastgpt/global/core/dataset/fullText/constants';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import {
  SqlFullTextMetadataSchema,
  type SqlFullTextMetadata
} from '@fastgpt/global/core/dataset/fullText/schema';
import { connectPg, PgClient } from './controller';
import { DatasetVectorTableName } from '../constants';
import type { FullTextSearchProps } from '../type';
import type { SqlFullTextRow } from '../fullText/type';
import {
  normalizeSqlFullTextScope,
  SQL_FULL_TEXT_COLUMN,
  SQL_FULL_TEXT_INDEX
} from '../fullText/utils';
import { executePostgresFullTextRows, findMissingPostgresVectorIds } from '../fullText/postgres';
import { toSqlFullTextQueryTerms } from '../fullText/analyzer';
import { getLogger, LogCategories } from '../../logger';

export const PG_FULL_TEXT_EXTENSION_VERSION = '0.26.6';
const metadataTable = 'fastgpt_fulltext_metadata';
const indexName = SQL_FULL_TEXT_INDEX;
const column = SQL_FULL_TEXT_COLUMN;
const logger = getLogger(LogCategories.INFRA.POSTGRES);

/** 读取目标库自身的持久身份；不使用连接串或主机名作为迁移身份。 */
export const getPgFullTextMetadata = async (): Promise<SqlFullTextMetadata> => {
  const { rows } = await PgClient.query(
    `SELECT target_id AS "targetId", schema_version AS "schemaVersion",
      analyzer_version AS "analyzerVersion" FROM ${metadataTable} WHERE singleton = true`
  );
  return SqlFullTextMetadataSchema.parse(rows[0]);
};

type PgFullTextIndex = {
  extversion: string;
  indisvalid: boolean;
  definition: string;
};

const readIndexSql = `SELECT e.extversion, i.indisvalid, pg_get_indexdef(i.indexrelid) AS definition
  FROM pg_extension e, pg_index i
  WHERE e.extname = 'pg_search' AND i.indexrelid = to_regclass('${indexName}')
    AND i.indrelid = to_regclass('${DatasetVectorTableName}')`;
const capabilityError =
  'PG full-text extension or index does not match the supported configuration';

const hasExpectedDefinition = (row: PgFullTextIndex) =>
  row.extversion === PG_FULL_TEXT_EXTENSION_VERSION &&
  row.definition.replace(/\s+/g, ' ').split(' USING ')[1] ===
    `paradedb (id, ((${column})::pdb.whitespace), ((team_id)::pdb.literal), ((dataset_id)::pdb.literal), ((collection_id)::pdb.literal))`;

/** 精确核对已安装扩展和全文索引；同名错误索引不能被 IF NOT EXISTS 当作成功。 */
export const assertPgFullTextCapability = async () => {
  const {
    rows: [index]
  } = await PgClient.query<PgFullTextIndex>(readIndexSql);
  if (!index?.indisvalid || !hasExpectedDefinition(index)) throw new Error(capabilityError);
};

/** 仅旧表缺列时才申请短暂的表排他锁，重启和建索引都复用这个检查。 */
export const ensurePgFullTextColumnSql = `DO $fulltext$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = '${DatasetVectorTableName}'::regclass AND attname = '${column}'
      AND attnum > 0 AND NOT attisdropped
  ) THEN
    PERFORM set_config('lock_timeout', '5s', true);
    ALTER TABLE ${DatasetVectorTableName} ADD COLUMN IF NOT EXISTS ${column} TEXT;
  END IF;
END
$fulltext$`;

/**
 * 手动迁移准备列、物理目标和索引。用会话级锁串行化跨节点准备，
 * 列 DDL 独立提交后再在线建索引，避免建索引时持有表排他锁。
 */
export const preparePgFullText = async ({
  signal
}: { signal?: AbortSignal } = {}): Promise<SqlFullTextMetadata> => {
  signal?.throwIfAborted();
  // 独立会话沿用目标库配置，避免连接池的短查询超时中断大型索引构建。
  const { options } = await connectPg();
  signal?.throwIfAborted();
  const connection = { ...options, password: options.password };
  const client = new Client({
    ...connection,
    application_name: 'fastgpt-pg-fulltext-prepare',
    query_timeout: 0,
    statement_timeout: 0
  });
  client.on('error', (error) => {
    if (!signal?.aborted) logger.warn('PG full-text preparation connection failed', { error });
  });
  let backend: { pid: number; startedAt: string } | undefined;
  let closing: Promise<void> | undefined;
  const close = () =>
    (closing ??= (async () => {
      try {
        if (signal?.aborted && backend) {
          // 仅终止本轮 DDL 会话。独立短连接等待服务端释放锁，PID 和启动时间必须同时匹配。
          const control = new Client({
            ...connection,
            connectionTimeoutMillis: 3000,
            query_timeout: 5000,
            statement_timeout: 4000
          });
          control.on('error', (error) =>
            logger.warn('PG full-text cancellation connection failed', { error })
          );
          try {
            await control.connect();
            const {
              rows: [result]
            } = await control.query<{ terminated: boolean }>(
              `SELECT pg_terminate_backend(pid, 3000) AS terminated
               FROM pg_stat_activity WHERE pid = $1 AND backend_start = $2::timestamptz`,
              [backend.pid, backend.startedAt]
            );
            if (result?.terminated === false)
              logger.warn('PG full-text preparation backend did not exit in time');
          } finally {
            await control.end();
          }
        }
      } finally {
        await client.end();
      }
    })().catch((error) => logger.warn('PG full-text preparation could not close', { error })));
  const abort = () => void close();
  const executeDdl = async (sql: string, values?: unknown[]) => {
    signal?.throwIfAborted();
    await client.query(sql, values);
  };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    await client.connect();
    signal?.throwIfAborted();
    if (signal) {
      const { rows } = await client.query<{ pid: number; startedAt: string }>(
        `SELECT pg_backend_pid() AS pid, backend_start::text AS "startedAt"
         FROM pg_stat_activity WHERE pid = pg_backend_pid()`
      );
      backend = rows[0];
      signal.throwIfAborted();
    }
    await client.query("SET lock_timeout = '5s'");
    await client.query('SELECT pg_advisory_lock(20261110, 1)');
    const version = await client.query<{ server_version_num: string }>('SHOW server_version_num');
    const serverVersion = Number(version.rows[0].server_version_num);
    if (serverVersion < 150019 || serverVersion >= 160000) {
      throw new Error(
        'PG full-text currently requires PostgreSQL 15.19+ within 15.x; verify the extension binary first'
      );
    }
    await executeDdl('CREATE EXTENSION IF NOT EXISTS pg_search');
    const extension = await client.query<{ extversion: string }>(
      "SELECT extversion FROM pg_extension WHERE extname = 'pg_search'"
    );
    if (extension.rows[0]?.extversion !== PG_FULL_TEXT_EXTENSION_VERSION) {
      throw new Error(`PG full-text requires pg_search ${PG_FULL_TEXT_EXTENSION_VERSION}`);
    }
    const existingMetaTable = await client.query<{ regclass: string | null }>(
      `SELECT to_regclass('${metadataTable}')::text AS regclass`
    );
    if (existingMetaTable.rows[0]?.regclass) {
      // 兼容曾创建过无结构版本字段的预览库，保留目标 ID 和词串签名。
      await executeDdl(
        `ALTER TABLE ${metadataTable} ADD COLUMN IF NOT EXISTS schema_version INTEGER NOT NULL DEFAULT 1`
      );
      const existingMeta = await client.query(
        `SELECT target_id AS "targetId", schema_version AS "schemaVersion",
          analyzer_version AS "analyzerVersion" FROM ${metadataTable} WHERE singleton = true`
      );
      if (existingMeta.rows[0]) SqlFullTextMetadataSchema.parse(existingMeta.rows[0]);
    }

    const {
      rows: [index]
    } = await client.query<PgFullTextIndex>(readIndexSql);
    if (index && !hasExpectedDefinition(index)) throw new Error(capabilityError);
    await executeDdl(ensurePgFullTextColumnSql);
    if (!index?.indisvalid) {
      // 并发建索引被中断时可能留下无效索引。仅重建同表、同名且定义完全匹配的索引。
      if (index) await executeDdl(`DROP INDEX CONCURRENTLY ${indexName}`);
      await executeDdl(`CREATE INDEX CONCURRENTLY IF NOT EXISTS ${indexName} ON ${DatasetVectorTableName}
        USING paradedb (id, (${column}::pdb.whitespace),
          (team_id::pdb.literal), (dataset_id::pdb.literal), (collection_id::pdb.literal))`);
    }
    const {
      rows: [preparedIndex]
    } = await client.query<PgFullTextIndex>(readIndexSql);
    if (!preparedIndex?.indisvalid || !hasExpectedDefinition(preparedIndex))
      throw new Error(capabilityError);

    await executeDdl(`CREATE TABLE IF NOT EXISTS ${metadataTable} (
      singleton BOOLEAN PRIMARY KEY CHECK (singleton), target_id UUID NOT NULL,
      schema_version INTEGER NOT NULL, analyzer_version TEXT NOT NULL
    )`);
    await executeDdl(
      `INSERT INTO ${metadataTable} (singleton, target_id, schema_version, analyzer_version)
      VALUES (true, $1, $2, $3)
      ON CONFLICT (singleton) DO NOTHING`,
      [randomUUID(), SQL_FULL_TEXT_SCHEMA_VERSION, SQL_FULL_TEXT_ANALYZER_VERSION]
    );
    const result = await client.query(
      `SELECT target_id AS "targetId", schema_version AS "schemaVersion",
        analyzer_version AS "analyzerVersion" FROM ${metadataTable} WHERE singleton = true`
    );
    signal?.throwIfAborted();
    return SqlFullTextMetadataSchema.parse(result.rows[0]);
  } finally {
    signal?.removeEventListener('abort', abort);
    await close();
  }
};

/**
 * 只给同归属的已有行补 NULL 词串，不创建向量、不覆盖已填词串。
 * 返回逐行校验结果，调用方再次核对 Mongo 当前引用后决定失效引用还是迁移失败。
 */
export const fillPgFullText = (rows: SqlFullTextRow[], validateOnly = false) =>
  executePostgresFullTextRows({
    query: PgClient.query.bind(PgClient),
    rows,
    mode: validateOnly ? 'validate' : 'fill'
  });

/** 为迁移区分物理缺失与已有行的内容/归属冲突。 */
export const findMissingPgVectorIds = (ids: string[]) =>
  findMissingPostgresVectorIds({ query: PgClient.query.bind(PgClient), ids });

/**
 * 查询先经外置分析器切成去重后的词数组，按词精确匹配（不再由数据库分词），业务范围在 Top-K 前过滤。
 * 查询只含停用词、标点或空白时没有可检索的词，直接返回空结果。
 */
export const searchPgFullText = async (props: FullTextSearchProps) => {
  const { teamId, datasetIds, query, limit, forbidCollectionIdList, filterCollectionIdList } =
    normalizeSqlFullTextScope(props);
  const allowed = filterCollectionIdList?.filter((id) => !forbidCollectionIdList.includes(id));
  if (!query.trim() || limit <= 0 || !datasetIds.length || allowed?.length === 0) return [];
  const terms = await toSqlFullTextQueryTerms(query);
  if (!terms.length) return [];
  const { rows } = await PgClient.query<{ vectorId: string; collectionId: string; score: number }>(
    `SELECT id::text AS "vectorId", collection_id AS "collectionId", pdb.score(id) AS score
     FROM ${DatasetVectorTableName}
     WHERE ${column} ||| $1::text[] AND team_id = $2 AND dataset_id = ANY($3::varchar[])
       AND ($4::varchar[] IS NULL OR collection_id = ANY($4::varchar[]))
       AND NOT (collection_id = ANY($5::varchar[]))
     ORDER BY pdb.score(id) DESC, id ASC LIMIT $6`,
    [terms, teamId, datasetIds, allowed ?? null, forbidCollectionIdList, limit]
  );
  return rows;
};
