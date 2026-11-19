import { z } from 'zod';
import { SQL_FULL_TEXT_ANALYZER_VERSION, SQL_FULL_TEXT_SCHEMA_VERSION } from './constants';

export const SqlFullTextProviderSchema = z.enum(['pg', 'oceanbase', 'seekdb', 'opengauss']);
export type SqlFullTextProvider = z.infer<typeof SqlFullTextProviderSchema>;

/**
 * 物理目标身份由数据库持久化，断点及就绪记录必须绑定同一目标和分词规则。
 * 各 SQL provider 只存 FastGPT 外置分析器（jieba 搜索模式）输出的词串（fulltext_tokens 列），
 * 数据库侧配置由适配器核验，analyzerVersion 只描述外置分词规则。
 */
export const SqlFullTextMetadataSchema = z.object({
  targetId: z.uuid(),
  schemaVersion: z.literal(SQL_FULL_TEXT_SCHEMA_VERSION),
  analyzerVersion: z.literal(SQL_FULL_TEXT_ANALYZER_VERSION)
});
export type SqlFullTextMetadata = z.infer<typeof SqlFullTextMetadataSchema>;
