import { jiebaSearchTokens } from '../../string/jieba/index';
import type { SqlFullTextRow, SqlFullTextTokenRow } from './type';
import { assertSqlFullText, assertSqlFullTextTokens } from './utils';

/**
 * 外置分析器签名：jieba 搜索模式 + jiebaSplit 预处理与停用词 + 转小写。
 * 切词模式、词典、停用词或归一化规则任一变化，都必须升级本签名及各 provider 的 analyzerVersion，
 * 并整体重新生成词串、重建索引；否则旧词串与新查询词对不上会静默漏检。
 */
export const SQL_FULL_TEXT_EXTERNAL_ANALYZER = 'fastgpt-jieba-search-v1';

/**
 * 写入与回填核对：把原文转换为空格分隔的词串。
 * 空原文（如图片索引）得到空串；原文受 1 MiB / 空字符契约约束，超限直接失败而不截断。
 */
export const toSqlFullTextTokens = async (text: string) => {
  assertSqlFullText(text);
  const tokens = (await jiebaSearchTokens({ text })).join(' ');
  assertSqlFullTextTokens(tokens);
  return tokens;
};

/**
 * 检索：用同一个分析器切分查询并去重。
 * 返回空数组表示查询里只有停用词、标点或空白，调用方应直接返回空结果，不再访问数据库。
 */
export const toSqlFullTextQueryTerms = async (query: string) => {
  assertSqlFullText(query);
  return [...new Set(await jiebaSearchTokens({ text: query }))];
};

/** 按原顺序把业务全文输入批量转换为待写库的词串行。 */
export const tokenizeSqlFullTextRows = (rows: SqlFullTextRow[]): Promise<SqlFullTextTokenRow[]> =>
  Promise.all(
    rows.map(async ({ text, ...row }) => ({ ...row, tokens: await toSqlFullTextTokens(text) }))
  );
