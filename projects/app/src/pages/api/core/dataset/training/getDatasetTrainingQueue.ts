import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  hasDatasetTrainingTask,
  canSwitchEmbeddingModel as checkCanSwitchEmbeddingModel
} from '@fastgpt/service/core/dataset/training/entity';
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

  const [hasTrainingTask, canSwitchEmbeddingModel] = await Promise.all([
    hasDatasetTrainingTask({ teamId, datasetId }),
    checkCanSwitchEmbeddingModel({ teamId, datasetId })
  ]);
  return GetDatasetTrainingQueueResponseSchema.parse({
    hasTrainingTask,
    canSwitchEmbeddingModel
  });
}

export default NextAPI(handler);
