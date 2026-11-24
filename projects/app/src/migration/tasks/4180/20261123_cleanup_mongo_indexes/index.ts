import { LEGACY_DEPRECATED_MONGO_INDEXES } from '@fastgpt/service/common/mongo/legacyDeprecatedIndexCleanup';
import { createMongoIndexCleanupMigration } from '@/migration/mongoIndexCleanup';

/**
 * v4.18.0 废弃 MongoDB 索引一次性后台清理任务（独立模式，幂等全量重跑，不保存 checkpoint）。
 *
 * 清理历史上从 11 个旧 Schema 收口至 `LEGACY_DEPRECATED_MONGO_INDEXES` 的 18 条废弃索引；
 * 按 `name + key + 完整 options` 精确匹配删除，保守跳过客户自建索引，并遵循 `MONGO_DEPRECATE_INDEX` 开关。
 */
export const cleanupMongoIndexes = createMongoIndexCleanupMigration({
  entries: LEGACY_DEPRECATED_MONGO_INDEXES
});
