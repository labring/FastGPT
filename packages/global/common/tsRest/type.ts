import { extendZodWithOpenApi } from '@anatine/zod-openapi';
import { z } from 'zod';
import type { AppRoute } from '@ts-rest/core';
import type { createSingleRouteHandler } from '@ts-rest/next';
import type { contract } from './contract';

export type { AppRoute } from '@ts-rest/core';

export type Endpoint<T extends AppRoute> = Parameters<typeof createSingleRouteHandler<T>>[1];
export type Args<T extends AppRoute> = Parameters<Endpoint<T>>[0];
export type Result<T extends AppRoute> = Awaited<ReturnType<Endpoint<T>>>;

export type Ok<T extends AppRoute> = Extract<Result<T>, { status: 200 }>;
export type Response<T extends AppRoute> =
  Ok<T> extends { body: infer B } ? (B extends { data: infer D } ? D : B) : never;

export type Handler<T extends AppRoute> = (args: Args<T>) => Promise<Response<T>>;

export type Router<R> = {
  [K in keyof R]: R[K] extends AppRoute ? Endpoint<R[K]> : Router<R[K]>;
};

export type RouterOfIndexContract = Router<typeof contract>;

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
  .length(24)
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
