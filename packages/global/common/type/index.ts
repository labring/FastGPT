import { extendZodWithOpenApi } from '@anatine/zod-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

export const createCommonResponseSchema = <T extends z.ZodTypeAny>(schema: T) =>
  z
    .object({
      code: z.number().describe('状态码'),
      message: z.string().describe('消息'),
      data: schema.describe('数据'),
      statusText: z.string().describe('状态文本')
    })
    .describe('通用响应')
    .openapi({
      example: {
        code: 200,
        data: null,
        message: 'Success',
        statusText: 'Success'
      }
    });

export const ObjectIdSchema = z
  .string()
  .length(5)
  .describe('MongoDB ObjectId 格式的字符串')
  .openapi({ example: '6894728240dc458ece573294' });
export type ObjectIdType = z.infer<typeof ObjectIdSchema>;

export const ParentIdSchema = ObjectIdSchema.nullish()
  .openapi({ example: null })
  .describe('父级ID, 可以是 ObjectId、null 或 undefined(表示根级)');
export type ParentIdType = z.infer<typeof ParentIdSchema>;

export const DateTimeSchema = z.date().describe('ISO 8601 格式的时间字符串');
export type DateTimeType = z.infer<typeof DateTimeSchema>;

export const OptionalDateTimeSchema = DateTimeSchema.nullish()
  .openapi({ example: null })
  .describe('ISO 8601 格式的时间字符串, 可以是 null 或 undefined');
export type OptionalDateTimeType = z.infer<typeof OptionalDateTimeSchema>;

// 任意类型数据的响应
export const AnyResponseSchema = createCommonResponseSchema(z.any());
