import type { LogEvent, Logger as KyselyLogger } from 'kysely';
import { getConfiguredDbRuntime } from '../runtime';
import type { DbDatasource } from '../types';

const SQL_TABLE_REGEX_BY_VERB = [
  { verb: 'SELECT', regex: /\bFROM\s+[`"]?([a-zA-Z0-9_]+)[`"]?/i },
  { verb: 'INSERT', regex: /\bINTO\s+[`"]?([a-zA-Z0-9_]+)[`"]?/i },
  { verb: 'UPDATE', regex: /\bUPDATE\s+[`"]?([a-zA-Z0-9_]+)[`"]?/i },
  { verb: 'DELETE', regex: /\bFROM\s+[`"]?([a-zA-Z0-9_]+)[`"]?/i },
  {
    verb: 'CREATE',
    regex:
      /\b(?:TABLE|INDEX)\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?[`"]?([a-zA-Z0-9_]+)[`"]?/i
  },
  { verb: 'ALTER', regex: /\bTABLE\s+[`"]?([a-zA-Z0-9_]+)[`"]?/i },
  {
    verb: 'DROP',
    regex: /\b(?:TABLE|INDEX)\s+(?:CONCURRENTLY\s+)?(?:IF\s+EXISTS\s+)?[`"]?([a-zA-Z0-9_]+)[`"]?/i
  }
] as const;

/** 从已编译 SQL 文本中提取操作动词与目标表名，用于慢查询日志与 Profiling 聚合。 */
export const parseSqlOperationSummary = (
  sqlText: string
): { operation: string; table?: string } => {
  const trimmed = sqlText.trim();
  const verbMatch = trimmed.match(/^([a-zA-Z]+)/);
  const verb = verbMatch?.[1]?.toUpperCase() ?? 'SQL';

  for (const rule of SQL_TABLE_REGEX_BY_VERB) {
    if (rule.verb === verb) {
      const tableMatch = trimmed.match(rule.regex);
      return {
        operation: verb.toLowerCase(),
        ...(tableMatch?.[1] !== undefined ? { table: tableMatch[1] } : {})
      };
    }
  }

  return { operation: verb.toLowerCase() };
};

/**
 * 构建 Kysely 查询观测监听器，将所有 SQL 查询（含事务内语句）耗时与成败统一接入
 * `DbRuntime.recordOperation()`，与 Mongo 中间件共享慢查询告警和 Profiling 指标通道。
 */
export const createSqlQueryLogger = (datasource: DbDatasource): KyselyLogger => {
  return (event: LogEvent) => {
    const runtime = getConfiguredDbRuntime();
    if (runtime === undefined) {
      return;
    }

    const { operation, table } = parseSqlOperationSummary(event.query.sql);
    runtime.recordOperation({
      datasource,
      table,
      operation,
      durationMs: Math.max(0, Math.round(event.queryDurationMillis)),
      success: event.level !== 'error'
    });
  };
};
