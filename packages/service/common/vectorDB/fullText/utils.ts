import type { SqlFullTextTokenRow } from './type';
import type { FullTextSearchProps } from '../type';

export const SQL_FULL_TEXT_MAX_BYTES = 1024 * 1024;
/** 搜索模式分词会输出重叠子词与空格分隔符；词串单独给定 16 MiB 安全上界（兼容 MEDIUMTEXT/LONGTEXT 与 TEXT），避免合法 < 1 MiB 原文切词膨胀后误触原文上限。 */
export const SQL_FULL_TEXT_MAX_TOKEN_BYTES = 16 * 1024 * 1024;

/** 各 SQL provider 存放外置分词结果的列；只存词串，不存原文（原文以 Mongo 为准）。 */
export const SQL_FULL_TEXT_COLUMN = 'fulltext_tokens';

/** 各 SQL provider 统一的原生全文索引名。 */
export const SQL_FULL_TEXT_INDEX = 'modeldata_fulltext';

/**
 * 单条全文记录的向量 ID 或文本内容契约错误。
 * 继承 Error 保持调用方兼容，同时供迁移层识别并归入可定位业务 ID 的单记录失败。
 */
export class SqlFullTextDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SqlFullTextDataError';
  }
}

/** 校验 SQL 向量主键为合法的正有符号 64 位整数。 */
export const assertSqlFullTextVectorId = (vectorId: string) => {
  if (!/^[1-9]\d*$/.test(vectorId) || BigInt(vectorId) > 9223372036854775807n) {
    throw new SqlFullTextDataError('Full-text vector ID must be a positive signed bigint');
  }
};

/** Mongo 文档中的 ObjectId 在内部调用中可能仍为对象，进入 SQL 前统一使用规范字符串。 */
export const normalizeSqlFullTextScope = (props: FullTextSearchProps): FullTextSearchProps => ({
  ...props,
  teamId: String(props.teamId),
  datasetIds: props.datasetIds.map(String),
  forbidCollectionIdList: props.forbidCollectionIdList.map(String),
  filterCollectionIdList: props.filterCollectionIdList?.map(String)
});

/** 业务原文统一输入契约：超过 1 MiB 或含空字符时报告失败，禁止静默截断。 */
export const assertSqlFullText = (text: string) => {
  if (Buffer.byteLength(text, 'utf8') > SQL_FULL_TEXT_MAX_BYTES || text.includes('\0')) {
    throw new SqlFullTextDataError('Full-text input exceeds 1 MiB or contains a null character');
  }
};

/** 词串输出契约：禁止空字符并限制在列安全容量内，允许合法原文经重叠分词后超过 1 MiB。 */
export const assertSqlFullTextTokens = (tokens: string) => {
  if (Buffer.byteLength(tokens, 'utf8') > SQL_FULL_TEXT_MAX_TOKEN_BYTES || tokens.includes('\0')) {
    throw new SqlFullTextDataError(
      'Full-text token string exceeds 16 MiB or contains a null character'
    );
  }
};

/** 按行数与 UTF-8 字节双重拆批，保证单文档展开为大量索引时仍有明确内存上界。 */
export function* splitSqlFullTextRows(rows: SqlFullTextTokenRow[]) {
  let chunk: SqlFullTextTokenRow[] = [];
  let bytes = 0;
  for (const row of rows) {
    assertSqlFullTextVectorId(row.vectorId);
    assertSqlFullTextTokens(row.tokens);
    const size = Buffer.byteLength(row.tokens, 'utf8');
    if (chunk.length && (chunk.length === 50 || bytes + size > SQL_FULL_TEXT_MAX_BYTES)) {
      yield chunk;
      chunk = [];
      bytes = 0;
    }
    chunk.push(row);
    bytes += size;
  }
  if (chunk.length) yield chunk;
}
