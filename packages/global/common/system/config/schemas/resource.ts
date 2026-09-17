import z from 'zod';
import { positiveInteger } from './primitives';

export const ResourceConfigSchema = z.strictObject({
  serviceRequestMaxContentLength: positiveInteger(10),
  maxFolderDepth: z.number().int().min(2).max(20).default(4),
  appFolderMaxAmount: positiveInteger(1000),
  datasetFolderMaxAmount: positiveInteger(1000),
  uploadFileMaxSize: positiveInteger(1000),
  uploadFileMaxAmount: positiveInteger(1000),
  systemMaxStringLengthM: z.number().int().min(1).max(100).default(100)
});
