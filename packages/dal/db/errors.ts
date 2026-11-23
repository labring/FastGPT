export type DbErrorCode =
  | 'DB_CONFIGURATION_ERROR'
  | 'DB_RUNTIME_NOT_CONFIGURED'
  | 'DB_UNIQUE_CONFLICT'
  | 'DB_TRANSACTION_CONFLICT'
  | 'DB_TRANSACTION_OUTCOME_UNKNOWN'
  | 'DB_RECORD_CORRUPTED'
  | 'DB_OPERATION_FAILED';

/** 数据库访问层统一错误基类，屏蔽 Mongoose、PostgreSQL 与 OceanBase/MySQL 驱动原始异常结构差异。 */
export class DbError extends Error {
  readonly code: DbErrorCode;
  override readonly cause?: unknown;

  constructor({ message, code, cause }: { message: string; code: DbErrorCode; cause?: unknown }) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = new.target.name;
    this.code = code;
    this.cause = cause;
  }
}

export class DbConfigurationError extends DbError {
  constructor(message: string, cause?: unknown) {
    super({ message, code: 'DB_CONFIGURATION_ERROR', cause });
  }
}

export class DbRuntimeNotConfiguredError extends DbError {
  constructor(message = 'Database runtime has not been configured') {
    super({ message, code: 'DB_RUNTIME_NOT_CONFIGURED' });
  }
}

/** 跨库统一的唯一索引冲突异常（对应 Mongo E11000、PG 23505 与 OceanBase/MySQL 1062/ER_DUP_ENTRY）。 */
export class DbUniqueConflictError extends DbError {
  readonly table?: string;
  readonly constraint?: string;

  constructor({
    message = 'Database unique constraint violation',
    table,
    constraint,
    cause
  }: {
    message?: string;
    table?: string;
    constraint?: string;
    cause?: unknown;
  } = {}) {
    super({ message, code: 'DB_UNIQUE_CONFLICT', cause });
    this.table = table;
    this.constraint = constraint;
  }
}

/**
 * 标记可重试的并发事务冲突异常（仅限服务端已确定回滚的场景：Mongo 112 WriteConflict / TransientTransactionError，
 * PG 40001 / 40P01，MySQL 1213 死锁 / 1205 锁超时，OceanBase 6002 / 6004 / 6210 / 6223，
 * 以及业务显式抛出的乐观并发冲突）。
 */
export class DbTransactionConflictError extends DbError {
  constructor(cause?: unknown, message = 'Database transaction write conflict') {
    super({ message, code: 'DB_TRANSACTION_CONFLICT', cause });
  }
}

/**
 * 标记事务提交结果未知（无法确认服务端已提交还是已回滚）的不可自动重放异常。
 *
 * 典型来源：OceanBase 内部错误 `6225`（Transaction result is unknown）、OceanBase MySQL 协议复用错误码
 * `4012`（涵盖提交超时及结果未知等歧义状态）以及 MongoDB `UnknownTransactionCommitResult`。
 * 事务入口捕获后严禁盲目重跑，必须保留原始 `cause` 交由上层基于幂等键或对账流程处理。
 */
export class DbTransactionOutcomeUnknownError extends DbError {
  constructor(cause?: unknown, message = 'Database transaction outcome is unknown') {
    super({ message, code: 'DB_TRANSACTION_OUTCOME_UNKNOWN', cause });
  }
}

/** 单条记录出口未通过领域 Zod Schema 校验时抛出的内部数据损坏异常。 */
export class DbRecordCorruptedError extends DbError {
  readonly table: string;
  readonly recordId: string;
  readonly issues: readonly unknown[];

  constructor({
    table,
    recordId,
    issues,
    cause
  }: {
    table: string;
    recordId: string;
    issues: readonly unknown[];
    cause?: unknown;
  }) {
    super({
      message: `Corrupted database record in table "${table}" (id=${recordId})`,
      code: 'DB_RECORD_CORRUPTED',
      cause
    });
    this.table = table;
    this.recordId = recordId;
    this.issues = issues;
  }
}

export const isDbError = (error: unknown): error is DbError => error instanceof DbError;

const getRawErrorIdentifiers = (
  error: unknown
): { codes: Array<string | number>; messages: string[]; cause?: unknown } => {
  if (error === null || error === undefined || typeof error !== 'object') {
    return { codes: [], messages: [] };
  }
  const record = error as Record<string, unknown>;
  const codes: Array<string | number> = [];
  const messages: string[] = [];

  for (const field of ['code', 'errno'] as const) {
    const val = record[field];
    if (typeof val === 'string' || typeof val === 'number') {
      codes.push(val);
    }
  }
  for (const field of ['message', 'sqlMessage'] as const) {
    const val = record[field];
    if (typeof val === 'string' && val.length > 0) {
      messages.push(val);
    }
  }

  return {
    codes,
    messages,
    cause: record.cause
  };
};

const collectErrorCodes = (error: unknown, depth = 0): Array<string | number> => {
  if (depth > 3) {
    return [];
  }
  const { codes, cause } = getRawErrorIdentifiers(error);
  if (cause !== undefined && cause !== error) {
    return [...codes, ...collectErrorCodes(cause, depth + 1)];
  }
  return codes;
};

const collectErrorMessages = (error: unknown, depth = 0): string[] => {
  if (depth > 3) {
    return [];
  }
  const { messages, cause } = getRawErrorIdentifiers(error);
  if (cause !== undefined && cause !== error) {
    return [...messages, ...collectErrorMessages(cause, depth + 1)];
  }
  return messages;
};

const hasMongoErrorLabel = ({
  error,
  label,
  depth = 0
}: {
  error: unknown;
  label: string;
  depth?: number;
}): boolean => {
  if (depth > 3 || error === null || error === undefined || typeof error !== 'object') {
    return false;
  }
  if (
    'hasErrorLabel' in error &&
    typeof (error as { hasErrorLabel?: unknown }).hasErrorLabel === 'function' &&
    Boolean((error as { hasErrorLabel: (name: string) => boolean }).hasErrorLabel(label))
  ) {
    return true;
  }
  if (
    'errorLabels' in error &&
    Array.isArray((error as { errorLabels?: unknown }).errorLabels) &&
    (error as { errorLabels: unknown[] }).errorLabels.includes(label)
  ) {
    return true;
  }
  const cause = (error as { cause?: unknown }).cause;
  if (cause !== undefined && cause !== error) {
    return hasMongoErrorLabel({ error: cause, label, depth: depth + 1 });
  }
  return false;
};

const TRANSACTION_OUTCOME_UNKNOWN_MESSAGE_REGEX =
  /transaction\s+(?:result|outcome|commit)\s+(?:is\s+)?unknown|unknown\s+transaction\s+commit/i;

/** 识别 Mongo 11000、PostgreSQL 23505、OceanBase/MySQL 1062/ER_DUP_ENTRY 或已封装的 DbUniqueConflictError。 */
export const isDbUniqueConflictError = (error: unknown): boolean => {
  if (error instanceof DbUniqueConflictError) {
    return true;
  }
  const codes = collectErrorCodes(error);
  return codes.some(
    (code) => code === 11000 || code === '23505' || code === 1062 || code === 'ER_DUP_ENTRY'
  );
};

/**
 * 识别事务提交结果未知的歧义异常：
 * - OceanBase 内部错误 `6225`（Transaction result is unknown）及复用的 MySQL 协议错误码 `4012`；
 * - MongoDB `UnknownTransactionCommitResult`；
 * - 已封装的 `DbTransactionOutcomeUnknownError` 或携带明确提交结果未知文案的驱动错误。
 */
export const isDbTransactionOutcomeUnknownError = (error: unknown): boolean => {
  if (error instanceof DbTransactionOutcomeUnknownError) {
    return true;
  }
  if (hasMongoErrorLabel({ error, label: 'UnknownTransactionCommitResult' })) {
    return true;
  }
  const codes = collectErrorCodes(error);
  if (codes.some((code) => code === 6225 || code === '6225' || code === 4012 || code === '4012')) {
    return true;
  }
  const messages = collectErrorMessages(error);
  return messages.some((msg) => TRANSACTION_OUTCOME_UNKNOWN_MESSAGE_REGEX.test(msg));
};

/**
 * 识别可由事务入口重新开启新会话安全重跑的瞬态写冲突、串行化失败、死锁或 OceanBase 已确定回滚错误。
 *
 * 安全不变量：凡命中 `isDbTransactionOutcomeUnknownError`（含 OceanBase 6225 / 4012 及 Mongo
 * `UnknownTransactionCommitResult`）一律返回 `false`，防止对可能已提交的事务盲目重放。
 */
export const isDbTransientConflictError = (error: unknown): boolean => {
  if (isDbTransactionOutcomeUnknownError(error)) {
    return false;
  }
  if (error instanceof DbTransactionConflictError) {
    return true;
  }
  const codes = collectErrorCodes(error);
  if (
    codes.some(
      (code) =>
        code === 112 ||
        code === '40001' ||
        code === '40P01' ||
        code === 1213 ||
        code === 'ER_LOCK_DEADLOCK' ||
        code === 1205 ||
        code === 'ER_LOCK_WAIT_TIMEOUT' ||
        code === 6002 ||
        code === '6002' ||
        code === 6004 ||
        code === '6004' ||
        code === 6210 ||
        code === '6210' ||
        code === 6223 ||
        code === '6223'
    )
  ) {
    return true;
  }
  return hasMongoErrorLabel({ error, label: 'TransientTransactionError' });
};
