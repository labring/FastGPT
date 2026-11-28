import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  GetTrainingErrorBodySchema,
  GetTrainingErrorResponseSchema,
  type GetTrainingErrorBody,
  type GetTrainingErrorResponse
} from '@fastgpt/global/openapi/core/dataset/training/api';
import { getTrainingErrorPage } from '@fastgpt/service/core/dataset/training/mongo/errorQuery';

async function handler(req: ApiRequestProps): Promise<GetTrainingErrorResponse> {
  const { collectionId } = parseApiInput({
    req,
    bodySchema: GetTrainingErrorBodySchema
  }).body;
  const { offset, pageSize } = parsePaginationRequest(req);

  const { collection } = await authDatasetCollection({
    req,
    authToken: true,
    authApiKey: true,
    collectionId,
    per: ReadPermissionVal
  });

  const { items, total } = await getTrainingErrorPage({
    scope: {
      teamId: String(collection.teamId),
      datasetId: String(collection.datasetId),
      collectionId: String(collection._id)
    },
    offset,
    limit: pageSize
  });

  return GetTrainingErrorResponseSchema.parse({ total, list: items });
}

export default NextAPI(handler);
export type getTrainingErrorBody = GetTrainingErrorBody;
export type getTrainingErrorResponse = GetTrainingErrorResponse;
