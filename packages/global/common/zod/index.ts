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

/** 将可选字段中的显式 null 归一为 undefined，保持 schema 输出类型的可选语义。 */
export const optionalNullToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === null ? undefined : value), schema.optional()).optional();

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
