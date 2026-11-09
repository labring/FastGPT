import z from 'zod';
import { stripUrlTrailingSlash } from '../string/url';

const truthyBoolStrs = ['true', '1', 'yes', 'y', 'on'];
export const BoolSchema = z.preprocess((val) => {
  if (typeof val === 'boolean') return val;

  if (typeof val === 'string') {
    return truthyBoolStrs.includes(val.trim().toLowerCase());
  }

  if (typeof val === 'number') {
    if (val === 1) return true;
    if (val === 0) return false;
  }

  return val;
}, z.boolean());

export const NumSchema = z.coerce.number<number>();
export const IntSchema = NumSchema.int().nonnegative();
export const UrlSchema = z.string().url().transform(stripUrlTrailingSlash);

/**
 * 接受 ISO 日期时间字符串（显式偏移、Z 或无偏移）及有效 Date，校验后原样保留，不提前转换丢失偏移。
 * 兼容仅日期的旧调用，将 YYYY-MM-DD 补为无偏移的零点；不补日终、不扩展查询范围。
 * API 使用 new Date(value) 解释绝对时间：显式偏移优先，无偏移使用服务器时区；Date 已是绝对时间。
 */
export const DateSchema = z.union([
  z.string().datetime({ offset: true, local: true }),
  z
    .string()
    .date()
    .transform((value) => `${value}T00:00:00.000`),
  z.date()
]);

/** 将可选字段中的显式 null 归一为 undefined，保持 schema 输出类型的可选语义。 */
export const optionalNullToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === null ? undefined : value), schema.optional()).optional();

/** 将可选字段中的显式 null 或空字符串归一为 undefined，保持 schema 输出类型的可选语义，避免 z.coerce.number 将空值转为 0。 */
export const optionalEmptyToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z
    .preprocess((value) => (value === null || value === '' ? undefined : value), schema.optional())
    .optional();

/**
 * 归一化 HTTP GET query 中的数组参数。
 * 支持单值字符串（如 "1"）、逗号分隔字符串（如 "1,2"）以及原生数组（如 ["1", "2"]），
 * 统一包装为数组后交由底层 schema 进行类型校验与转换。
 */
export const queryArrayParam = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((val) => {
    if (val === undefined || val === null || val === '') return undefined;
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') {
      return val.includes(',') ? val.split(',').filter(Boolean) : [val];
    }
    return [val];
  }, schema);
