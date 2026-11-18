import {
  SQL_FULL_TEXT_ANALYZER_VERSION,
  SQL_FULL_TEXT_SCHEMA_VERSION
} from '@fastgpt/global/core/dataset/fullText/constants';
import { randomUUID } from 'node:crypto';
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

export const PG_FULL_TEXT_EXTENSION_VERSION = '0.26.6';
const metadataTable = 'fastgpt_fulltext_metadata';
const indexName = SQL_FULL_TEXT_INDEX;
const column = SQL_FULL_TEXT_COLUMN;

/** 读取目标库自身的持久身份；不使用连接串或主机名作为迁移身份。 */
export const getPgFullTextMetadata = async (): Promise<SqlFullTextMetadata> => {
  const { rows } = await PgClient.query(
    `SELECT target_id AS "targetId", schema_version AS "schemaVersion",
      analyzer_version AS "analyzerVersion" FROM ${metadataTable} WHERE singleton = true`
  );
  return SqlFullTextMetadataSchema.parse(rows[0]);
};

/** 精确核对已安装扩展和全文索引；同名错误索引不能被 IF NOT EXISTS 当作成功。 */
export const assertPgFullTextCapability = async () => {
  const { rows } = await PgClient.query<{
    extversion: string;
    indisvalid: boolean;
    definition: string;
  }>(`SELECT e.extversion, i.indisvalid, pg_get_indexdef(i.indexrelid) AS definition
    FROM pg_extension e, pg_index i
    WHERE e.extname = 'pg_search' AND i.indexrelid = to_regclass('${indexName}')
      AND i.indrelid = to_regclass('${DatasetVectorTableName}')`);
  const row = rows[0];
  const definition = row?.definition.replace(/\s+/g, ' ');
  if (
    row?.extversion !== PG_FULL_TEXT_EXTENSION_VERSION ||
    !row.indisvalid ||
    definition?.split(' USING ')[1] !==
      `paradedb (id, ((${column})::pdb.whitespace), ((team_id)::pdb.literal), ((dataset_id)::pdb.literal), ((collection_id)::pdb.literal))`
  ) {
    throw new Error('PG full-text extension or index does not match the supported configuration');
  }
};

/**
 * 准备阶段确保可空词串列、按空格切词的全文索引和目标身份就绪，不修改旧向量或 Mongo 业务数据。
 * 一张表只能有一个 ParadeDB 索引；建重型索引前先核对既有目标的分词规则，避免不兼容目标白建索引。
 * DDL 在事务中串行执行并限制锁等待；扩展二进制及 preload 由部署者提前准备。
 */
export const preparePgFullText = async (): Promise<SqlFullTextMetadata> => {
  const client = await (await connectPg()).connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query('SELECT pg_advisory_xact_lock(20261110, 1)');
    const version = await client.query<{ server_version_num: string }>('SHOW server_version_num');
    const serverVersion = Number(version.rows[0].server_version_num);
    if (serverVersion < 150019 || serverVersion >= 160000) {
      throw new Error(
        'PG full-text currently requires PostgreSQL 15.19+ within 15.x; verify the extension binary first'
      );
    }
    await client.query('CREATE EXTENSION IF NOT EXISTS pg_search');
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
      await client.query(
        `ALTER TABLE ${metadataTable} ADD COLUMN IF NOT EXISTS schema_version INTEGER NOT NULL DEFAULT 1`
      );
      const existingMeta = await client.query(
        `SELECT target_id AS "targetId", schema_version AS "schemaVersion",
          analyzer_version AS "analyzerVersion" FROM ${metadataTable} WHERE singleton = true`
      );
      if (existingMeta.rows[0]) {
        SqlFullTextMetadataSchema.parse(existingMeta.rows[0]);
      }
    }
    await client.query(
      `ALTER TABLE ${DatasetVectorTableName} ADD COLUMN IF NOT EXISTS ${column} TEXT`
    );
    await client.query(`CREATE INDEX IF NOT EXISTS ${indexName} ON ${DatasetVectorTableName}
      USING paradedb (id, (${column}::pdb.whitespace),
        (team_id::pdb.literal), (dataset_id::pdb.literal), (collection_id::pdb.literal))`);
    await client.query(`CREATE TABLE IF NOT EXISTS ${metadataTable} (
      singleton BOOLEAN PRIMARY KEY CHECK (singleton), target_id UUID NOT NULL,
      schema_version INTEGER NOT NULL, analyzer_version TEXT NOT NULL
    )`);
    await client.query(
      `INSERT INTO ${metadataTable} (singleton, target_id, schema_version, analyzer_version)
      VALUES (true, $1, $2, $3)
      ON CONFLICT (singleton) DO NOTHING`,
      [randomUUID(), SQL_FULL_TEXT_SCHEMA_VERSION, SQL_FULL_TEXT_ANALYZER_VERSION]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await assertPgFullTextCapability();
  return getPgFullTextMetadata();
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
