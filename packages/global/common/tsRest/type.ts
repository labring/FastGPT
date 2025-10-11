import type { AppRoute } from '@ts-rest/core';
import type { createSingleRouteHandler } from '@ts-rest/next';
import z from 'zod';

export type { AppRoute } from '@ts-rest/core';

export type Endpoint<T extends AppRoute> = Parameters<typeof createSingleRouteHandler<T>>[1];
export type Args<T extends AppRoute> = Parameters<Endpoint<T>>[0];
type Result<T extends AppRoute> = Awaited<ReturnType<Endpoint<T>>>;

type Ok<T extends AppRoute> = Extract<Result<T>, { status: 200 }>;
type Response<T extends AppRoute> =
  Ok<T> extends { body: infer B } ? (B extends { data: infer D } ? D : B) : never;

export type Handler<T extends AppRoute> = (args: Args<T>) => Promise<Response<T>>;

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
// 任意类型数据的响应
export const AnyResponseSchema = createCommonResponseSchema(z.any());
