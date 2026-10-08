import z from 'zod';
import { positiveInteger } from './primitives';

export const VectorConfigSchema = z.strictObject({
  hnswEfSearch: positiveInteger(100),
  hnswMaxScanTuples: positiveInteger(100_000)
});
