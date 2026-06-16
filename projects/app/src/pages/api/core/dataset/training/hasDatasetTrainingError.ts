import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { Types } from '@fastgpt/service/common/mongo';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { finalErrorTrainingMatch } from '@fastgpt/service/core/dataset/training/query';
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

  const { teamId, dataset } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: ReadPermissionVal
  });

  const errorRecord = await MongoDatasetTraining.findOne(
    {
      teamId: new Types.ObjectId(teamId),
      datasetId: new Types.ObjectId(dataset._id),
      ...finalErrorTrainingMatch
    },
    { _id: 1 },
    readFromSecondary
  ).lean();

  return HasDatasetTrainingErrorResponseSchema.parse({
    hasError: !!errorRecord
  });
}

export default NextAPI(handler);
export type hasDatasetTrainingErrorQuery = HasDatasetTrainingErrorQuery;
export type hasDatasetTrainingErrorResponse = HasDatasetTrainingErrorResponse;
