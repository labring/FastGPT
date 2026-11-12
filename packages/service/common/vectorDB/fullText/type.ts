import type {
  SqlFullTextMetadata,
  SqlFullTextProvider
} from '@fastgpt/global/core/dataset/fullText/schema';
import type { FullTextSearchProps } from '../type';

/** 业务侧的全文输入：text 为同义词处理后的原文，写库前统一经外置分析器转成词串。 */
export type SqlFullTextRow = {
  vectorId: string;
  teamId: string;
  datasetId: string;
  collectionId: string;
  text: string;
};

/** 写入/核对数据库时使用的行：tokens 为外置分析器输出、以空格分隔的词串。 */
export type SqlFullTextTokenRow = Omit<SqlFullTextRow, 'text'> & { tokens: string };

export type SqlFullTextHit = { vectorId: string; collectionId: string; score: number };

/**
 * 底层适配器不读取 Mongo 路由或业务内容；只提供物理全文能力。
 * 入参中的 text/query 均为原文，适配器内部统一调用外置分析器分词，数据库只按空格切词并打分。
 */
export type SqlFullTextAdapter = {
  provider: SqlFullTextProvider;
  analyzerVersion: SqlFullTextMetadata['analyzerVersion'];
  prepare: () => Promise<SqlFullTextMetadata>;
  assertCapability: () => Promise<void>;
  getMetadata: () => Promise<SqlFullTextMetadata>;
  /** 只读检查：允许待回填的 NULL，拒绝缺失行、归属冲突和非 NULL 词串冲突。 */
  preflight: (rows: SqlFullTextRow[]) => Promise<string[]>;
  fill: (rows: SqlFullTextRow[], validateOnly?: boolean) => Promise<string[]>;
  search: (props: FullTextSearchProps) => Promise<SqlFullTextHit[]>;
};
