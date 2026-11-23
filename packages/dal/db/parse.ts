import z from 'zod';
import { DbRecordCorruptedError } from './errors';
import { getDbLogger } from './runtime';
import type { DbLogger } from './types';

const extractRecordId = (rawRow: unknown): string => {
  if (rawRow !== null && rawRow !== undefined && typeof rawRow === 'object') {
    const record = rawRow as Record<string, unknown>;
    if (record._id !== null && record._id !== undefined) {
      return String(record._id);
    }
    if (record.id !== null && record.id !== undefined) {
      return String(record.id);
    }
  }
  return 'unknown';
};

/**
 * 单条数据库记录出口校验与归一化（Fail-Fast 策略）。
 * 校验失败时记录错误日志并抛出 `DbRecordCorruptedError`，阻断脏数据进入核心业务。
 */
export const parseRepoRow = <TSchema extends z.ZodTypeAny>({
  table,
  schema,
  row,
  logger
}: {
  table: string;
  schema: TSchema;
  row: unknown;
  logger?: Pick<DbLogger, 'error'>;
}): z.output<TSchema> => {
  const parsed = schema.safeParse(row);
  if (parsed.success) {
    return parsed.data;
  }

  const recordId = extractRecordId(row);
  const activeLogger = logger ?? getDbLogger();
  activeLogger.error('Repository single row failed schema validation', {
    table,
    recordId,
    issues: parsed.error.issues
  });

  throw new DbRecordCorruptedError({
    table,
    recordId,
    issues: parsed.error.issues,
    cause: parsed.error
  });
};

/**
 * 列表/批量数据库记录出口校验与脏数据隔离降级（Warn & Skip 策略）。
 * 正常走整批数组快路径；混入历史脏数据时退化为逐行校验，记录告警并跳过坏行。
 */
export const parseRepoRows = <TSchema extends z.ZodTypeAny>({
  table,
  schema,
  rows,
  logger
}: {
  table: string;
  schema: TSchema;
  rows: readonly unknown[];
  logger?: Pick<DbLogger, 'error'>;
}): z.output<TSchema>[] => {
  if (rows.length === 0) {
    return [];
  }

  const fastResult = z.array(schema).safeParse(rows);
  if (fastResult.success) {
    return fastResult.data;
  }

  const activeLogger = logger ?? getDbLogger();
  const validRows: z.output<TSchema>[] = [];

  for (const rawRow of rows) {
    const parsed = schema.safeParse(rawRow);
    if (parsed.success) {
      validRows.push(parsed.data);
      continue;
    }

    const recordId = extractRecordId(rawRow);
    activeLogger.error('Repository row failed schema validation, skipping corrupted record', {
      table,
      recordId,
      issues: parsed.error.issues
    });
  }

  return validRows;
};
