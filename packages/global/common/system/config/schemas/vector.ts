import z from 'zod';
import { positiveInteger } from './primitives';

export const VectorConfigSchema = z.strictObject({
  vqLevel: z
    .number()
    .int()
    .refine((value) => [2, 4, 8, 16, 32].includes(value))
    .default(32),
  languageIdentifier: z.enum(['lingua', 'whatlang']).default('lingua'),
  hnswEfSearch: positiveInteger(100),
  hnswMaxScanTuples: positiveInteger(100_000)
});
