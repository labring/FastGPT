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
