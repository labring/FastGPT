import { z } from 'zod';
import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import {
  getDatasetSyncDatasetStatus,
  getDatasetSyncJobScheduler
} from '@fastgpt/service/core/dataset/datasetSync';

const DatasetSyncStatusQuerySchema = z.object({
  datasetId: z.string().min(1)
});

async function handler(req: ApiRequestProps) {
  const { datasetId } = parseApiInput({
    req,
    querySchema: DatasetSyncStatusQuerySchema
  }).query;

  const { dataset } = await authDataset({
    req,
    authToken: true,
    datasetId,
    per: ManagePermissionVal
  });
  const [runtimeStatus, scheduler] = await Promise.all([
    getDatasetSyncDatasetStatus(datasetId),
    getDatasetSyncJobScheduler(datasetId)
  ]);

  return {
    datasetId,
    autoSync: !!dataset.autoSync,
    status: runtimeStatus.status,
    errorMsg: runtimeStatus.errorMsg,
    scheduler: scheduler
      ? {
          key: scheduler.key,
          next: scheduler.next,
          iterationCount: scheduler.iterationCount,
          every: scheduler.every,
          pattern: scheduler.pattern
        }
      : null
  };
}

export default NextAPI(handler);
