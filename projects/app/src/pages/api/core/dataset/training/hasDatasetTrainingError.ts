import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { getDatasetTrainingErrorReadScope } from '@/service/core/dataset/training/errorScope';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { hasTrainingErrors } from '@fastgpt/service/core/dataset/training/mongo/errorQuery';
import {
  HasDatasetTrainingErrorQuerySchema,
  HasDatasetTrainingErrorResponseSchema,
  type HasDatasetTrainingErrorQuery,
  type HasDatasetTrainingErrorResponse
} from '@fastgpt/global/openapi/core/dataset/training/api';

async function handler(req: ApiRequestProps): Promise<HasDatasetTrainingErrorResponse> {
  const { datasetId } = parseApiInput({
    req,
    querySchema: HasDatasetTrainingErrorQuerySchema
  }).query;

  const auth = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: ReadPermissionVal
  });

  const scope = await getDatasetTrainingErrorReadScope(auth);
  const hasError = await hasTrainingErrors(scope);
  return HasDatasetTrainingErrorResponseSchema.parse({ hasError });
}

export default NextAPI(handler);
export type hasDatasetTrainingErrorQuery = HasDatasetTrainingErrorQuery;
export type hasDatasetTrainingErrorResponse = HasDatasetTrainingErrorResponse;
