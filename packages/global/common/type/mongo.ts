import z from 'zod';

/**
 * MongoDB 24 位 Hex ObjectId 校验 Schema。
 * 支持传入字符串或带有 toString 的对象（如 Mongoose ObjectId）。
 */
export const ObjectIdSchema = z.preprocess(
  (value) => (typeof value === 'object' ? String(value) : value),
  z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/)
    .meta({ example: '68ee0bd23d17260b7829b137', description: 'ObjectId' })
);

// Zod v4 的 z.preprocess 默认将内部 $ZodTransform 标记为 optin: 'optional'，
// 导致 zod-openapi 生成文档时误将非可选的 ObjectIdSchema 判定为可选字段。
// 清理 optin 标记以确保 OpenAPI 文档生成和必填校验推断将其正确视为必填。
delete (ObjectIdSchema as any)._zod.def.in._zod.optin;
delete (ObjectIdSchema as any)._zod.optin;
