import { createEntityIdSchema } from '../string/entityId';

/** 兼容历史命名的 24 位十六进制实体 ID Schema（保留原始大小写透传，避免破坏现有索引名/入参契约）；新增领域仓储使用 EntityIdSchema。 */
export const ObjectIdSchema = createEntityIdSchema({
  description: 'ObjectId',
  normalizeCase: false
});
