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
 * 归一化数据库 JSON 载荷字段。
 *
 * PostgreSQL `jsonb` 与 `mysql2` `json` 通常直接返回对象/数组，但部分兼容驱动或降级 TEXT 列
 * 可能返回 JSON 字符串；在 Read Schema 中包裹此 helper 可确保跨库输出形态完全一致。
 */
export const jsonColumnSchema = <TSchema extends z.ZodTypeAny>(schema: TSchema) =>
  z.preprocess((value) => {
    if (typeof value !== 'string') {
      return value;
    }
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return undefined;
    }
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }, schema);

/**
 * 单条数据库记录出口校验与归一化（Fail-Fast 策略）。
 *
 * 用于 `findById`、`findOne`、`create` 等精确单行场景。若校验失败，立即记录结构化错误日志
 * 并抛出 `DbRecordCorruptedError`，阻断残缺或未归一化数据流入计费、权限等核心逻辑。
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
 *
 * 正常情况下走整批数组快速校验路径；当列表中混入远古历史脏数据时，自动退化为逐行校验：
 * 对坏行打印高优先级 `logger.error`（含表名、主键 ID 与 Zod issues），同时跳过坏行返回其余有效记录，
 * 避免单条历史脏数据导致整页列表 500 不可用。
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
