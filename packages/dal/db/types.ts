import z from 'zod';

/** 数据库无关的主键类型，允许 Mongo ObjectId、UUID 和 SQL sequence 在边界统一为字符串。 */
export const EntityIdSchema = z.string().min(1);
export type EntityId = z.infer<typeof EntityIdSchema>;
