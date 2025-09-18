import { z } from '../tsRest/z';

export const createCommonResponseSchema = <T extends z.ZodTypeAny>(schema: T) =>
  z.object({
    code: z.number().describe('状态码'),
    message: z.string().describe('消息'),
    data: schema.describe('数据'),
    statusText: z.string().describe('状态文本')
  });

export const ObjectIdSchema = z
  .string()
  .openapi({ example: '6894728240dc458ece573294' })
  .describe('MongoDB ObjectId 格式的字符串');
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

// UTM 参数
export const UtmParamsSchema = z
  .object({
    utm_source: z.string().optional().describe('流量来源'),
    utm_medium: z.string().optional().describe('推广媒介'),
    utm_campaign: z.string().optional().describe('推广活动'),
    utm_content: z.string().optional().describe('推广内容'),
    utm_term: z.string().optional().describe('推广关键词')
  })
  .describe('UTM 统计参数');

// 任意类型数据的响应
export const AnyResponseSchema = createCommonResponseSchema(z.any());

export type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = Omit<T, Keys> &
  {
    [K in Keys]-?: Required<Pick<T, K>> & Partial<Omit<T, K>>;
  }[Keys];

export type RequireOnlyOne<T, Keys extends keyof T = keyof T> = Omit<T, Keys> &
  {
    [K in Keys]-?: Required<Pick<T, K>> & Partial<Record<Exclude<Keys, K>, undefined>>;
  }[Keys];

export type DeepPartial<T> = {
  [P in keyof T]?: DeepPartial<T[P]>;
};
