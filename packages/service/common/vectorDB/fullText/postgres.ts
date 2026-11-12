import type { QueryResult, QueryResultRow } from 'pg';
import { DatasetVectorTableName } from '../constants';
import type { SqlFullTextRow } from './type';
import { SQL_FULL_TEXT_COLUMN, splitSqlFullTextRows } from './utils';
import { tokenizeSqlFullTextRows } from './analyzer';

export type PostgresFullTextQuery = <T extends QueryResultRow>(
  sql: string,
  values?: unknown[]
) => Promise<QueryResult<T>>;

/**
 * PG 协议公共预检/回填/验收：原文先经外置分析器转成词串，再与库中词串比较。
 * 预检允许尚未回填的 NULL；只有回填模式会写入，且只补同归属已有行的 NULL，不覆盖已有词串。
 */
export const executePostgresFullTextRows = async (
  query: PostgresFullTextQuery,
  rows: SqlFullTextRow[],
  mode: 'preflight' | 'fill' | 'validate'
) => {
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
      WHERE m.id IS NULL OR ${mode === 'preflight' ? `(m.${column} IS NOT NULL AND m.${column} IS DISTINCT FROM v.tokens)` : `m.${column} IS DISTINCT FROM v.tokens`}`,
      values
    );
    invalidIds.push(...invalid.map(({ id }) => id));
  }
  return invalidIds;
};
