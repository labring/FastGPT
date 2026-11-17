import { createEntityIdSchema } from '../string/entityId';

/** 兼容历史命名的 24 位十六进制实体 ID Schema；新增领域仓储优先使用 EntityIdSchema。 */
export const ObjectIdSchema = createEntityIdSchema({ description: 'ObjectId' });
