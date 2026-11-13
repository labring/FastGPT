import { z } from 'zod';

export const SqlFullTextProviderSchema = z.enum(['pg', 'oceanbase', 'seekdb', 'opengauss']);
export type SqlFullTextProvider = z.infer<typeof SqlFullTextProviderSchema>;

/**
 * 物理目标身份由数据库持久化，分词或表结构规则变化必须启动新的迁移代次。
 * 各 SQL provider 只存 FastGPT 外置分析器（jieba 搜索模式）输出的词串（fulltext_tokens 列），
 * 数据库侧只负责按空格切词与打分；analyzerVersion 同时编码数据库侧配置与外置分析器签名。
 */
export const SqlFullTextMetadataSchema = z.object({
  targetId: z.uuid(),
  schemaVersion: z.literal(1),
  analyzerVersion: z.enum([
    'pg-search-0.26.6-whitespace-fastgpt-jieba-search-v1',
    'oceanbase-space-fastgpt-jieba-search-v1',
    'seekdb-space-fastgpt-jieba-search-v1',
    'opengauss-bm25-fastgpt-jieba-search-v1'
  ])
});
export type SqlFullTextMetadata = z.infer<typeof SqlFullTextMetadataSchema>;
