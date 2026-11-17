import z from 'zod';

export const emptyUrlSchema = z.union([z.url(), z.literal('')]);

export const urlWithDefault = (defaultValue = '') => emptyUrlSchema.default(defaultValue);
export const textWithDefault = (defaultValue = '') => z.string().default(defaultValue);
export const positiveInteger = (defaultValue: number) =>
  z.number().int().positive().default(defaultValue);
export const nonNegativeInteger = (defaultValue: number) =>
  z.number().int().nonnegative().default(defaultValue);
export const positiveNumber = (defaultValue: number) => z.number().positive().default(defaultValue);
