import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { hasDatasetTrainingTask } from '@fastgpt/service/core/dataset/training/entity';
import {
  GetDatasetTrainingQueueQuerySchema,
  GetDatasetTrainingQueueResponseSchema,
  type GetDatasetTrainingQueueResponse
} from '@fastgpt/global/openapi/core/dataset/training/api';

async function handler(req: ApiRequestProps): Promise<GetDatasetTrainingQueueResponse> {
  const { datasetId } = parseApiInput({
    req,
    querySchema: GetDatasetTrainingQueueQuerySchema
  }).query;

  const { teamId } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: ReadPermissionVal
  });

  return GetDatasetTrainingQueueResponseSchema.parse({
    hasTrainingTask: await hasDatasetTrainingTask({ teamId, datasetId })
  });
}

export default NextAPI(handler);
