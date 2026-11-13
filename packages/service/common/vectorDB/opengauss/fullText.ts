import { randomUUID } from 'node:crypto';
import {
  SqlFullTextMetadataSchema,
  type SqlFullTextMetadata
} from '@fastgpt/global/core/dataset/fullText/schema';
import { DatasetVectorTableName } from '../constants';
import { connectOg, OgClient } from './controller';
import type { FullTextSearchProps } from '../type';
import type { SqlFullTextRow, SqlFullTextHit } from '../fullText/type';
import {
  normalizeSqlFullTextScope,
  SQL_FULL_TEXT_COLUMN,
  SQL_FULL_TEXT_INDEX
} from '../fullText/utils';
import { executePostgresFullTextRows } from '../fullText/postgres';
import { SQL_FULL_TEXT_EXTERNAL_ANALYZER, toSqlFullTextQueryTerms } from '../fullText/analyzer';

/**
 * 词串由外置分析器生成后写入，BM25 索引再用 openGauss 内置分词处理该词串。
 * 内置分词能否严格按空格切分未经实测验证；写入与查询都经过同一个内置分词，两侧仍保持一致。
 */
export const OPENGAUSS_FULL_TEXT_ANALYZER_VERSION =
  `opengauss-bm25-${SQL_FULL_TEXT_EXTERNAL_ANALYZER}` as const;
const metadataTable = 'fastgpt_fulltext_metadata';
const indexName = SQL_FULL_TEXT_INDEX;
const column = SQL_FULL_TEXT_COLUMN;

/** DataVec BM25 自 7.0.0 RC2 引入，RC1 与未知大版本不能误判为兼容（支持标准版及 openGauss-lite 镜像）。 */
export const assertOpenGaussFullTextVersion = (version: string) => {
  const match = version.match(/openGauss(?:-[a-z]+)?[-\s]+7\.0\.\d+(?:[-\s]+RC(\d+))?/i);
  if (!match || (match[1] !== undefined && Number(match[1]) < 2)) {
    throw new Error('OpenGauss full text requires 7.0.x with DataVec BM25 (RC2 or later)');
  }
};

/** 读取该物理库持久化的目标身份，同时检查分词配置版本。 */
export const getOpenGaussFullTextMetadata = async (): Promise<SqlFullTextMetadata> => {
  const { rows } =
    await OgClient.query(`SELECT target_id AS "targetId", schema_version AS "schemaVersion",
    analyzer_version AS "analyzerVersion" FROM ${metadataTable} WHERE singleton = true`);
  const metadata = SqlFullTextMetadataSchema.parse(rows[0]);
  if (metadata.analyzerVersion !== OPENGAUSS_FULL_TEXT_ANALYZER_VERSION) {
    throw new Error('OpenGauss full-text analyzer version differs from this adapter');
  }
  return metadata;
};

/**
 * 检查真实 BM25 单列索引及索引执行计划，避免只有同名索引或退成全表扫描。
 * 使用默认内置词典；自定义 dict_path 必须作为新 analyzer 版本另行迁移。
 */
export const assertOpenGaussFullTextCapability = async () => {
  const { rows } = await OgClient.query<{ valid: boolean }>(`SELECT
    (i.indisvalid AND i.indnatts=1 AND a.amname='bm25' AND i.indpred IS NULL
      AND pg_get_indexdef(i.indexrelid,1,true)='${column}'
      AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(c.reloptions,ARRAY[]::text[])) opt
        WHERE opt LIKE 'dict_path=%')) AS valid
    FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
    JOIN pg_am a ON a.oid=c.relam
    WHERE c.relname='${indexName}' AND i.indrelid='${DatasetVectorTableName}'::regclass
      AND c.relnamespace=(SELECT relnamespace FROM pg_class WHERE oid='${DatasetVectorTableName}'::regclass)`);
  if (!rows[0]?.valid) throw new Error('OpenGauss BM25 index is absent, invalid or incompatible');
  const plan = await OgClient.query<{ 'QUERY PLAN': string }>(
    `EXPLAIN SELECT /*+ indexscan (${DatasetVectorTableName} ${indexName}) */ id
     FROM ${DatasetVectorTableName} ORDER BY ${column} <&> $1::text DESC LIMIT 1`,
    ['全文 检索 能力 探测']
  );
  if (
    !plan.rows.some((row) =>
      new RegExp(`Index Scan using .*${indexName}`, 'i').test(row['QUERY PLAN'])
    )
  ) {
    throw new Error('OpenGauss BM25 query does not use the expected full-text index');
  }
};

/**
 * 对既有 astore 普通表追加词串字段与 BM25 索引；不转换存储引擎、不改向量。
 * 迁移准备阶段在事务中核对版本、表类型与索引，错误回滚本次事务。
 */
export const prepareOpenGaussFullText = async () => {
  const client = await (await connectOg()).connect();
  try {
    await client.query('BEGIN');
    const version = await client.query<{ version: string }>('SELECT version() AS version');
    assertOpenGaussFullTextVersion(version.rows[0].version);
    const method = await client.query("SELECT 1 FROM pg_am WHERE amname='bm25'");
    if (!method.rows.length) throw new Error('DataVec BM25 is unavailable in this OpenGauss build');
    await client.query(`LOCK TABLE ${DatasetVectorTableName} IN SHARE UPDATE EXCLUSIVE MODE`);
    const table = await client.query<{ relkind: string; reloptions: string[] | null }>(
      `SELECT relkind,reloptions FROM pg_class WHERE oid='${DatasetVectorTableName}'::regclass`
    );
    if (
      table.rows[0]?.relkind !== 'r' ||
      table.rows[0].reloptions?.some((value) =>
        /storage_type=ustore|orientation=column|orientation=orc/i.test(value)
      )
    )
      throw new Error('OpenGauss full text requires an ordinary astore row table');
    const existingMetaTable = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema=current_schema() AND table_name=$1`,
      [metadataTable]
    );
    if (existingMetaTable.rows.length) {
      const existingMeta = await client.query(
        `SELECT target_id AS "targetId", schema_version AS "schemaVersion",
          analyzer_version AS "analyzerVersion" FROM ${metadataTable} WHERE singleton = true`
      );
      if (existingMeta.rows[0]) {
        const parsed = SqlFullTextMetadataSchema.parse(existingMeta.rows[0]);
        if (parsed.analyzerVersion !== OPENGAUSS_FULL_TEXT_ANALYZER_VERSION) {
          throw new Error('OpenGauss full-text analyzer version differs from this adapter');
        }
      }
    }
    const columnInfo = await client.query<{ data_type: string; is_nullable: string }>(
      `SELECT data_type,is_nullable FROM information_schema.columns
       WHERE table_schema=current_schema() AND table_name=$1 AND column_name=$2`,
      [DatasetVectorTableName, column]
    );
    if (!columnInfo.rows.length)
      await client.query(`ALTER TABLE ${DatasetVectorTableName} ADD COLUMN ${column} TEXT`);
    else if (columnInfo.rows[0].data_type !== 'text' || columnInfo.rows[0].is_nullable !== 'YES') {
      throw new Error('OpenGauss full-text column must be nullable TEXT');
    }
    const index = await client.query(
      `SELECT c.oid AS existing FROM pg_class c
      WHERE c.relname=$1 AND c.relnamespace=(SELECT relnamespace FROM pg_class WHERE oid='${DatasetVectorTableName}'::regclass)`,
      [indexName]
    );
    if (!index.rows[0]?.existing)
      await client.query(
        `CREATE INDEX ${indexName} ON ${DatasetVectorTableName} USING bm25(${column})`
      );
    await client.query(`CREATE TABLE IF NOT EXISTS ${metadataTable} (
      singleton BOOLEAN PRIMARY KEY CHECK(singleton), target_id UUID NOT NULL,
      schema_version INTEGER NOT NULL, analyzer_version TEXT NOT NULL)`);
    await client.query(
      `INSERT INTO ${metadataTable}
      SELECT true,$1::uuid,1,$2::text WHERE NOT EXISTS (SELECT 1 FROM ${metadataTable} WHERE singleton=true)`,
      [randomUUID(), OPENGAUSS_FULL_TEXT_ANALYZER_VERSION]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await assertOpenGaussFullTextCapability();
  return getOpenGaussFullTextMetadata();
};

/** 复用 PG 协议的条件 UPDATE 与写后比较，保留原有向量和 ID。 */
export const fillOpenGaussFullText = (rows: SqlFullTextRow[], validateOnly = false) =>
  executePostgresFullTextRows({
    query: OgClient.query.bind(OgClient),
    rows,
    mode: validateOnly ? 'validate' : 'fill'
  });

/** 只读核对有效引用及已有词串，允许尚未填充的 NULL。 */
export const preflightOpenGaussFullText = (rows: SqlFullTextRow[]) =>
  executePostgresFullTextRows({
    query: OgClient.query.bind(OgClient),
    rows,
    mode: 'preflight'
  });

/**
 * OpenGauss 的 <&> 必须配合 BM25 索引降序排序；过滤先于 LIMIT。
 * 查询先经外置分析器切成去重词，以空格连接后交给 BM25；只含停用词/标点时直接返回空结果。
 * 原生零分表示没有命中，不参与业务召回；原始分数交由现有 RRF/rerank 消费。
 */
export const searchOpenGaussFullText = async (
  input: FullTextSearchProps
): Promise<SqlFullTextHit[]> => {
  const props = normalizeSqlFullTextScope(input);
  const allowed = props.filterCollectionIdList?.filter(
    (id) => !props.forbidCollectionIdList.includes(id)
  );
  if (!props.query.trim() || props.limit <= 0 || !props.datasetIds.length || allowed?.length === 0)
    return [];
  const terms = await toSqlFullTextQueryTerms(props.query);
  if (!terms.length) return [];
  const { rows } = await OgClient.query<{
    vectorId: string;
    collectionId: string;
    score: number | string;
  }>(
    `SELECT /*+ indexscan (${DatasetVectorTableName} ${indexName}) */
       id::text AS "vectorId",collection_id AS "collectionId",${column} <&> $1::text AS score
     FROM ${DatasetVectorTableName} WHERE team_id=$2 AND dataset_id=ANY($3::varchar[])
       AND ($4::varchar[] IS NULL OR collection_id=ANY($4::varchar[]))
       AND NOT (collection_id=ANY($5::varchar[]))
     ORDER BY ${column} <&> $1::text DESC LIMIT $6`,
    [
      terms.join(' '),
      String(props.teamId),
      props.datasetIds,
      allowed ?? null,
      props.forbidCollectionIdList,
      props.limit
    ]
  );
  return rows
    .filter((row) => Number(row.score) > 0)
    .map((row) => ({ ...row, score: Number(row.score) }));
};
