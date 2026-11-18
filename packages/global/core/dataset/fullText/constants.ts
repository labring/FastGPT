export const SQL_FULL_TEXT_MIGRATION_ID = '20261110_migrate_sql_fulltext';
export const SQL_FULL_TEXT_SCHEMA_VERSION = 1;

/**
 * 全文词串的分词规则版本：jieba 搜索模式、词典、预处理、停用词与小写归一化。
 * 规则变化必须升级版本并重新生成词串；数据库引擎与索引配置由各适配器单独核验。
 */
export const SQL_FULL_TEXT_ANALYZER_VERSION = 'fastgpt-jieba-search-v1';
