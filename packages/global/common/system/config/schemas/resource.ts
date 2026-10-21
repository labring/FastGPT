import z from 'zod';
import { nonNegativeInteger, positiveInteger } from './primitives';

export const ResourceConfigSchema = z.strictObject({
  serviceRequestMaxContentLength: positiveInteger(10),
  maxFolderDepth: z.number().int().min(2).max(20).default(4),
  // 旧 env IntSchema 允许 0，消费点为纯数值比较（folderCount + amount > max），
  // 0 = 禁止创建新目录；保持迁移前后一致
  appFolderMaxAmount: nonNegativeInteger(1000),
  datasetFolderMaxAmount: nonNegativeInteger(1000),
  uploadFileMaxSize: positiveInteger(1000),
  uploadFileMaxAmount: positiveInteger(1000),
  systemMaxStringLengthM: z.number().int().min(1).max(100).default(100),
  exportDatasetLimitMinutes: nonNegativeInteger(0),
  websiteSyncLimitMinuted: nonNegativeInteger(0)
});
