import type { QueryResult, QueryResultRow } from 'pg';
import { DatasetVectorTableName } from '../constants';
import type { InsertVectorControllerPropsType } from '../type';
import type { SqlFullTextRow } from './type';
import { SQL_FULL_TEXT_COLUMN, splitSqlFullTextRows } from './utils';
import { tokenizeSqlFullTextRows, toSqlFullTextTokens } from './analyzer';

export type PostgresFullTextQuery = <T extends QueryResultRow>(
  sql: string,
  values?: unknown[]
) => Promise<QueryResult<T>>;

export type PostgresVectorInsertClient = {
  query: PostgresFullTextQuery;
  release: () => void;
};

// 单条 INSERT 最多绑定 500 行（2500 个参数），避免大批量写入触及 PG 协议参数数量上限。
const FULL_TEXT_INSERT_BATCH_SIZE = 500;

/**
 * PG 协议（PostgreSQL / openGauss）公共向量与全文词串同写实现。
 * 原文先经外置分析器转成词串，小批次单条 INSERT，跨批在同一事务中顺序写入。
 */
export const insertPostgresVectorFullTextRows = async ({
  props,
  query,
  connect,
  missingTextsErrorMessage
}: {
  props: InsertVectorControllerPropsType;
  query: PostgresFullTextQuery;
  connect: () => Promise<PostgresVectorInsertClient>;
  missingTextsErrorMessage: string;
}): Promise<{ insertIds: string[] }> => {
  const { teamId, datasetId, collectionId, vectors } = props;
  if (props.texts?.length !== vectors.length) {
    throw new Error(missingTextsErrorMessage);
  }
  if (!vectors.length) return { insertIds: [] };
  const tokens = await Promise.all(props.texts.map(toSqlFullTextTokens));

  const buildBatchInsert = (start: number, end: number) => {
    const slice = vectors.slice(start, end);
    const values = slice.flatMap((vector, offset) => [
      `[${vector.join(',')}]`,
      String(teamId),
      String(datasetId),
      String(collectionId),
      tokens[start + offset]
    ]);
    const tuples = slice
      .map((_, offset) => {
        const n = offset * 5;
        return `($${n + 1},$${n + 2},$${n + 3},$${n + 4},$${n + 5})`;
      })
      .join(',');
    return {
      sql: `INSERT INTO ${DatasetVectorTableName} (vector,team_id,dataset_id,collection_id,${SQL_FULL_TEXT_COLUMN})
       VALUES ${tuples} RETURNING id::text`,
      values
    };
  };

  if (vectors.length <= FULL_TEXT_INSERT_BATCH_SIZE) {
    const { sql, values } = buildBatchInsert(0, vectors.length);
    const { rows } = await query<{ id: string }>(sql, values);
    return { insertIds: rows.map(({ id }) => id) };
  }

  const client = await connect();
  try {
    await client.query('BEGIN');
    const insertIds: string[] = [];
    for (let start = 0; start < vectors.length; start += FULL_TEXT_INSERT_BATCH_SIZE) {
      const { sql, values } = buildBatchInsert(start, start + FULL_TEXT_INSERT_BATCH_SIZE);
      const { rows } = await client.query<{ id: string }>(sql, values);
      insertIds.push(...rows.map(({ id }) => id));
    }
    await client.query('COMMIT');
    return { insertIds };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * PG 协议公共回填/验收：先完成源文本与 ID 校验，回填仅补同归属已有行的 NULL。
 * 已有非空词串不覆盖；每批写后比较归属与词串，冲突返回调用方定位，验收模式只读。
 */
export const executePostgresFullTextRows = async ({
  query,
  rows,
  mode
}: {
  query: PostgresFullTextQuery;
  rows: SqlFullTextRow[];
  mode: 'fill' | 'validate';
}) => {
  const invalidIds: string[] = [];
  const column = SQL_FULL_TEXT_COLUMN;
  for (const chunk of splitSqlFullTextRows(await tokenizeSqlFullTextRows(rows))) {
    const values = chunk.flatMap(({ vectorId, teamId, datasetId, collectionId, tokens }) => [
      vectorId,
      teamId,
      datasetId,
      collectionId,
      tokens
    ]);
    const tuples = chunk
      .map((_, index) => {
        const n = index * 5;
        return `($${n + 1}::bigint,$${n + 2}::text,$${n + 3}::text,$${n + 4}::text,$${n + 5}::text)`;
      })
      .join(',');
    if (mode === 'fill')
      await query(
        `UPDATE ${DatasetVectorTableName} m SET ${column} = v.tokens
      FROM (VALUES ${tuples}) AS v(id,team_id,dataset_id,collection_id,tokens)
      WHERE m.id=v.id AND m.team_id=v.team_id AND m.dataset_id=v.dataset_id
        AND m.collection_id=v.collection_id AND m.${column} IS NULL`,
        values
      );
    const { rows: invalid } = await query<{ id: string }>(
      `SELECT v.id::text FROM (VALUES ${tuples}) AS v(id,team_id,dataset_id,collection_id,tokens)
      LEFT JOIN ${DatasetVectorTableName} m ON m.id=v.id AND m.team_id=v.team_id
        AND m.dataset_id=v.dataset_id AND m.collection_id=v.collection_id
      WHERE m.id IS NULL OR m.${column} IS DISTINCT FROM v.tokens`,
      values
    );
    invalidIds.push(...invalid.map(({ id }) => id));
  }
  return invalidIds;
};
