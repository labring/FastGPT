import { DbConfigurationError } from '../errors';
import type { SqlDialect } from '../types';

/**
 * 跨 PostgreSQL 与 OceanBase/MySQL 可移植列类型集合。
 *
 * 刻意排除数组列、专有全文列等方言耦合类型，确保同一份表结构定义可无损编译到目标 SQL 引擎。
 */
export type PortableSqlColumnKind =
  | 'entityId'
  | 'varchar'
  | 'text'
  | 'boolean'
  | 'integer'
  | 'bigint'
  | 'double'
  | 'timestamp'
  | 'json';

export type SqlColumnDef = {
  kind: PortableSqlColumnKind;
  length?: number;
  nullable?: boolean;
  defaultValue?: string | number | boolean;
  primaryKey?: boolean;
};

export type SqlIndexDef = {
  name: string;
  columns: readonly string[];
  unique?: boolean;
};

export type SqlTableDefinition = {
  name: string;
  columns: Record<string, SqlColumnDef>;
  indexes?: readonly SqlIndexDef[];
};

const VALID_IDENTIFIER_REGEX = /^[a-z_][a-z0-9_]*$/;

const assertIdentifier = (name: string, label: string): string => {
  if (!VALID_IDENTIFIER_REGEX.test(name)) {
    throw new DbConfigurationError(`Invalid SQL ${label} identifier: "${name}"`);
  }
  return name;
};

const quoteIdent = (name: string, dialect: SqlDialect): string => {
  const safe = assertIdentifier(name, 'column/table');
  return dialect === 'postgres' ? `"${safe}"` : `\`${safe}\``;
};

const formatSqlDefaultLiteral = (value: string | number | boolean, dialect: SqlDialect): string => {
  if (typeof value === 'string') {
    return `'${value.replaceAll("'", "''")}'`;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new DbConfigurationError(`Invalid non-finite numeric default: ${value}`);
    }
    return String(value);
  }
  if (dialect === 'postgres') {
    return value ? 'TRUE' : 'FALSE';
  }
  return value ? '1' : '0';
};

const resolveSqlColumnType = (column: SqlColumnDef, dialect: SqlDialect): string => {
  switch (column.kind) {
    case 'entityId':
      return 'VARCHAR(24)';
    case 'varchar': {
      const length = column.length ?? 255;
      if (!Number.isSafeInteger(length) || length <= 0 || length > 16383) {
        throw new DbConfigurationError(`Invalid varchar length: ${length}`);
      }
      return `VARCHAR(${length})`;
    }
    case 'text':
      // MySQL/OceanBase 的 TEXT 上限仅 64KB，统一映射为 LONGTEXT 避免长提示词/切片静默截断
      return dialect === 'postgres' ? 'TEXT' : 'LONGTEXT';
    case 'boolean':
      return dialect === 'postgres' ? 'BOOLEAN' : 'TINYINT(1)';
    case 'integer':
      return 'INTEGER';
    case 'bigint':
      return 'BIGINT';
    case 'double':
      return dialect === 'postgres' ? 'DOUBLE PRECISION' : 'DOUBLE';
    case 'timestamp':
      // MySQL/OceanBase 默认 DATETIME 会截断毫秒，显式声明 (3) 保持与 PG TIMESTAMPTZ 毫秒对齐
      return dialect === 'postgres' ? 'TIMESTAMPTZ' : 'DATETIME(3)';
    case 'json':
      return dialect === 'postgres' ? 'JSONB' : 'JSON';
  }
};

/** 声明一张跨 PostgreSQL 与 OceanBase/MySQL 可移植的 SQL 表结构定义。 */
export const defineSqlTable = (definition: SqlTableDefinition): SqlTableDefinition => {
  assertIdentifier(definition.name, 'table');
  const columnNames = new Set(Object.keys(definition.columns));

  for (const col of columnNames) {
    assertIdentifier(col, 'column');
  }
  for (const index of definition.indexes ?? []) {
    assertIdentifier(index.name, 'index');
    if (index.columns.length === 0) {
      throw new DbConfigurationError(`Index "${index.name}" must declare at least one column`);
    }
    for (const col of index.columns) {
      if (!columnNames.has(col)) {
        throw new DbConfigurationError(
          `Index "${index.name}" references unknown column "${col}" on table "${definition.name}"`
        );
      }
    }
  }

  return definition;
};

/**
 * 将中立表定义编译为目标 SQL 方言的幂等建表与索引 DDL 语句集合。
 *
 * - PostgreSQL：生成 `CREATE TABLE IF NOT EXISTS` 与 `CREATE [UNIQUE] INDEX IF NOT EXISTS`；
 * - OceanBase / MySQL：将索引内联进 `CREATE TABLE IF NOT EXISTS`，规避 MySQL 8 不支持 `CREATE INDEX IF NOT EXISTS` 的差异。
 */
export const compileSqlTableDDL = (
  definition: SqlTableDefinition,
  dialect: SqlDialect
): string[] => {
  const tableIdent = quoteIdent(definition.name, dialect);
  const columnDefs: string[] = [];
  const primaryKeys: string[] = [];

  for (const [colName, colDef] of Object.entries(definition.columns)) {
    const parts = [quoteIdent(colName, dialect), resolveSqlColumnType(colDef, dialect)];
    if (colDef.nullable !== true) {
      parts.push('NOT NULL');
    }
    if (colDef.defaultValue !== undefined) {
      parts.push(`DEFAULT ${formatSqlDefaultLiteral(colDef.defaultValue, dialect)}`);
    }
    columnDefs.push(parts.join(' '));
    if (colDef.primaryKey === true) {
      primaryKeys.push(quoteIdent(colName, dialect));
    }
  }

  if (primaryKeys.length > 0) {
    columnDefs.push(`PRIMARY KEY (${primaryKeys.join(', ')})`);
  }

  const indexes = definition.indexes ?? [];

  if (dialect === 'postgres') {
    const createTableSql = `CREATE TABLE IF NOT EXISTS ${tableIdent} (\n  ${columnDefs.join(',\n  ')}\n);`;
    const indexSqls = indexes.map((idx) => {
      const uniqueKeyword = idx.unique === true ? 'UNIQUE ' : '';
      const cols = idx.columns.map((c) => quoteIdent(c, dialect)).join(', ');
      return `CREATE ${uniqueKeyword}INDEX IF NOT EXISTS ${quoteIdent(idx.name, dialect)} ON ${tableIdent} (${cols});`;
    });
    return [createTableSql, ...indexSqls];
  }

  // OceanBase / MySQL 内联索引语法天然幂等
  for (const idx of indexes) {
    const cols = idx.columns.map((c) => quoteIdent(c, dialect)).join(', ');
    const keyword = idx.unique === true ? 'UNIQUE KEY' : 'KEY';
    columnDefs.push(`${keyword} ${quoteIdent(idx.name, dialect)} (${cols})`);
  }

  return [`CREATE TABLE IF NOT EXISTS ${tableIdent} (\n  ${columnDefs.join(',\n  ')}\n);`];
};
