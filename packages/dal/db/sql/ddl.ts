import { DbConfigurationError } from '../errors';
import type { DbDatasource, SqlDialect } from '../types';

/** FastGPT 托管 SQL 索引统一命名命名前缀（用于严格隔离客户 DBA 自建索引）。 */
export const SQL_INDEX_NAME_PREFIX = 'fg_';

/** 跨 PostgreSQL（63B）与 OceanBase/MySQL（64B）的标识符最紧公共上限。 */
export const MAX_SQL_IDENTIFIER_BYTES = 63;

/** InnoDB / OceanBase utf8mb4 单索引最大估算字节宽上限。 */
export const MAX_OB_MYSQL_INDEX_BYTES = 3072;

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

export type SqlIndexDirection = 'asc' | 'desc';

export type SqlIndexColumnDef =
  | string
  | {
      column: string;
      direction?: SqlIndexDirection;
    };

export type SqlIndexDef = {
  name: string;
  columns: readonly SqlIndexColumnDef[];
  unique?: boolean;
};

export type SqlTableDefinition = {
  name: string;
  datasource?: DbDatasource;
  columns: Record<string, SqlColumnDef>;
  indexes?: readonly SqlIndexDef[];
};

const VALID_IDENTIFIER_REGEX = /^[a-z_][a-z0-9_]*$/;
const VALID_MANAGED_INDEX_NAME_REGEX = /^fg_[a-z0-9_]+$/;

const assertIdentifier = (name: string, label: string): string => {
  if (!VALID_IDENTIFIER_REGEX.test(name)) {
    throw new DbConfigurationError(`Invalid SQL ${label} identifier: "${name}"`);
  }
  if (Buffer.byteLength(name, 'ascii') > MAX_SQL_IDENTIFIER_BYTES) {
    throw new DbConfigurationError(
      `SQL ${label} identifier "${name}" exceeds ${MAX_SQL_IDENTIFIER_BYTES} bytes`
    );
  }
  return name;
};

/** 校验 FastGPT 托管 SQL 索引命名规范（强制 `fg_` 前缀与 `<= 63` ASCII 字节）。 */
export const assertManagedSqlIndexName = (name: string): string => {
  if (!VALID_MANAGED_INDEX_NAME_REGEX.test(name)) {
    throw new DbConfigurationError(
      `Managed SQL index "${name}" must start with "${SQL_INDEX_NAME_PREFIX}" and use lowercase ASCII snake_case`
    );
  }
  if (Buffer.byteLength(name, 'ascii') > MAX_SQL_IDENTIFIER_BYTES) {
    throw new DbConfigurationError(
      `Managed SQL index "${name}" exceeds ${MAX_SQL_IDENTIFIER_BYTES} bytes`
    );
  }
  return name;
};

/** 将字符串或带方向对象的索引列定义规范化为 `{ column, direction }`。 */
export const normalizeSqlIndexColumn = (
  entry: SqlIndexColumnDef
): { column: string; direction: SqlIndexDirection } => {
  if (typeof entry === 'string') {
    return { column: entry, direction: 'asc' };
  }
  const direction = entry.direction ?? 'asc';
  if (direction !== 'asc' && direction !== 'desc') {
    throw new DbConfigurationError(
      `Invalid SQL index sort direction "${String(direction)}" on column "${entry.column}"`
    );
  }
  return { column: entry.column, direction };
};

/** 按 OceanBase/MySQL `utf8mb4`（4B/char）估算单列在索引中的最坏字节占用。 */
export const estimateSqlColumnIndexBytes = (column: SqlColumnDef): number | null => {
  const nullableOverhead = column.nullable === true ? 1 : 0;
  switch (column.kind) {
    case 'entityId':
      return 24 * 4 + 2 + nullableOverhead;
    case 'varchar': {
      const length = column.length ?? 255;
      return length * 4 + 2 + nullableOverhead;
    }
    case 'boolean':
      return 1 + nullableOverhead;
    case 'integer':
      return 4 + nullableOverhead;
    case 'bigint':
    case 'double':
    case 'timestamp':
      return 8 + nullableOverhead;
    default:
      return null;
  }
};

export const quoteSqlIdentifier = (name: string, dialect: SqlDialect): string => {
  const safe = assertIdentifier(name, 'column/table');
  return dialect === 'postgres' ? `"${safe}"` : `\`${safe}\``;
};

/** 编译索引列列表（含 `DESC` 方向标记；默认 `ASC` 省略以保持最简跨方言语法）。 */
export const compileSqlIndexColumnList = (
  columns: readonly SqlIndexColumnDef[],
  dialect: SqlDialect
): string =>
  columns
    .map((entry) => {
      const { column, direction } = normalizeSqlIndexColumn(entry);
      const quoted = quoteSqlIdentifier(column, dialect);
      return direction === 'desc' ? `${quoted} DESC` : quoted;
    })
    .join(', ');

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

/**
 * 声明一张跨 OceanBase / MySQL 8+（P0）与 PostgreSQL 14+（P1）可移植的 SQL 表结构定义。
 *
 * 在模块加载期即执行 OceanBase/MySQL 硬护栏静态校验：
 * - 禁止对 `text` / `json` 列声明字面量 `defaultValue`（OB/MySQL `ERROR 1101`）；
 * - 强制所有索引名以 `fg_` 开头且 `<= 63` 字节，同表内禁止重名；
 * - 禁止对 `text` / `json` 列建普通 B-Tree 索引；
 * - 复合索引在 `utf8mb4` 下最坏估算字节宽必须 `<= 3072B`。
 */
export const defineSqlTable = (definition: SqlTableDefinition): SqlTableDefinition => {
  assertIdentifier(definition.name, 'table');
  const columnNames = new Set(Object.keys(definition.columns));

  for (const [colName, colDef] of Object.entries(definition.columns)) {
    assertIdentifier(colName, 'column');
    if (colDef.kind === 'varchar') {
      const length = colDef.length ?? 255;
      if (!Number.isSafeInteger(length) || length <= 0 || length > 16383) {
        throw new DbConfigurationError(
          `Invalid varchar length ${length} on column "${definition.name}.${colName}"`
        );
      }
    }
    if ((colDef.kind === 'text' || colDef.kind === 'json') && colDef.defaultValue !== undefined) {
      throw new DbConfigurationError(
        `Column "${definition.name}.${colName}" (${colDef.kind}) cannot declare defaultValue (OceanBase/MySQL ERROR 1101)`
      );
    }
  }

  const seenIndexNames = new Set<string>();
  for (const index of definition.indexes ?? []) {
    assertManagedSqlIndexName(index.name);
    if (seenIndexNames.has(index.name)) {
      throw new DbConfigurationError(
        `Duplicate index name "${index.name}" declared on table "${definition.name}"`
      );
    }
    seenIndexNames.add(index.name);

    if (index.columns.length === 0) {
      throw new DbConfigurationError(`Index "${index.name}" must declare at least one column`);
    }

    let totalBytes = 0;
    for (const rawCol of index.columns) {
      const { column: colName } = normalizeSqlIndexColumn(rawCol);
      if (!columnNames.has(colName)) {
        throw new DbConfigurationError(
          `Index "${index.name}" references unknown column "${colName}" on table "${definition.name}"`
        );
      }
      const colDef = definition.columns[colName];
      if (colDef.kind === 'text' || colDef.kind === 'json') {
        throw new DbConfigurationError(
          `Index "${index.name}" cannot index ${colDef.kind} column "${definition.name}.${colName}" on OceanBase/MySQL`
        );
      }
      const colBytes = estimateSqlColumnIndexBytes(colDef);
      if (colBytes !== null) {
        totalBytes += colBytes;
      }
    }

    if (totalBytes > MAX_OB_MYSQL_INDEX_BYTES) {
      throw new DbConfigurationError(
        `Index "${index.name}" on table "${definition.name}" estimated width ${totalBytes}B exceeds OceanBase/MySQL utf8mb4 limit (${MAX_OB_MYSQL_INDEX_BYTES}B)`
      );
    }
  }

  return definition;
};

/**
 * 校验跨表注册表的全局唯一性约束（防止表名冲突以及 PostgreSQL Schema 全局索引名碰撞）。
 */
export const validateSqlTableRegistry = (tables: readonly SqlTableDefinition[]): void => {
  const seenTables = new Set<string>();
  const indexOwners = new Map<string, string>();

  for (const table of tables) {
    const datasource = table.datasource ?? 'main';
    const tableKey = `${datasource}:${table.name}`;
    if (seenTables.has(tableKey)) {
      throw new DbConfigurationError(
        `Duplicate SQL table "${table.name}" registered for datasource "${datasource}"`
      );
    }
    seenTables.add(tableKey);

    // PostgreSQL 在单 Schema 内要求索引名跨表全局唯一；按全仓统一防撞可兼容 shared 单库回退模式
    for (const index of table.indexes ?? []) {
      const existingOwner = indexOwners.get(index.name);
      if (existingOwner !== undefined) {
        throw new DbConfigurationError(
          `Duplicate SQL index name "${index.name}" across tables "${existingOwner}" and "${table.name}"`
        );
      }
      indexOwners.set(index.name, table.name);
    }
  }
};

/**
 * 将中立表定义编译为目标 SQL 方言的幂等建表与索引 DDL 语句集合。
 *
 * - OceanBase / MySQL（P0）：显式声明 `DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin` 对齐区分大小写语义，
 *   并将索引内联进 `CREATE TABLE IF NOT EXISTS` 以规避 MySQL 8 不支持 `CREATE INDEX IF NOT EXISTS`；
 * - PostgreSQL（P1）：生成 `CREATE TABLE IF NOT EXISTS` 与 `CREATE [UNIQUE] INDEX IF NOT EXISTS`。
 */
export const compileSqlTableDDL = (
  definition: SqlTableDefinition,
  dialect: SqlDialect
): string[] => {
  const tableIdent = quoteSqlIdentifier(definition.name, dialect);
  const columnDefs: string[] = [];
  const primaryKeys: string[] = [];

  for (const [colName, colDef] of Object.entries(definition.columns)) {
    const parts = [quoteSqlIdentifier(colName, dialect), resolveSqlColumnType(colDef, dialect)];
    if (colDef.nullable !== true) {
      parts.push('NOT NULL');
    }
    if (colDef.defaultValue !== undefined) {
      parts.push(`DEFAULT ${formatSqlDefaultLiteral(colDef.defaultValue, dialect)}`);
    }
    columnDefs.push(parts.join(' '));
    if (colDef.primaryKey === true) {
      primaryKeys.push(quoteSqlIdentifier(colName, dialect));
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
      const cols = compileSqlIndexColumnList(idx.columns, dialect);
      return `CREATE ${uniqueKeyword}INDEX IF NOT EXISTS ${quoteSqlIdentifier(idx.name, dialect)} ON ${tableIdent} (${cols});`;
    });
    return [createTableSql, ...indexSqls];
  }

  // OceanBase / MySQL 内联索引语法天然幂等，且显式 utf8mb4_bin 保证等值与唯一键严格区分大小写
  for (const idx of indexes) {
    const cols = compileSqlIndexColumnList(idx.columns, dialect);
    const keyword = idx.unique === true ? 'UNIQUE KEY' : 'KEY';
    columnDefs.push(`${keyword} ${quoteSqlIdentifier(idx.name, dialect)} (${cols})`);
  }

  return [
    `CREATE TABLE IF NOT EXISTS ${tableIdent} (\n  ${columnDefs.join(',\n  ')}\n) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;`
  ];
};
