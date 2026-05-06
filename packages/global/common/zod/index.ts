import z from 'zod';
import { stripUrlTrailingSlash } from '../string/url';

const truthyBoolStrs = ['true', '1', 'yes', 'y'];
export const BoolSchema = z
  .string()
  .transform((val) => truthyBoolStrs.includes(val.toLowerCase()))
  .pipe(z.boolean());

export const NumSchema = z.coerce.number<number>();
export const IntSchema = NumSchema.int().nonnegative();
export const UrlSchema = z.string().url().transform(stripUrlTrailingSlash);
