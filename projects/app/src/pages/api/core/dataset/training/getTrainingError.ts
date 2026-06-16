import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { Types, type PipelineStage } from '@fastgpt/service/common/mongo';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  GetTrainingErrorBodySchema,
  GetTrainingErrorResponseSchema,
  type GetTrainingErrorBody,
  type GetTrainingErrorResponse
} from '@fastgpt/global/openapi/core/dataset/training/api';
import {
  finalErrorTrainingMatch,
  trainingModeRanks
} from '@fastgpt/service/core/dataset/training/query';

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

  const match = {
    teamId: new Types.ObjectId(collection.teamId),
    datasetId: new Types.ObjectId(collection.datasetId),
    collectionId: new Types.ObjectId(collection._id),
    ...finalErrorTrainingMatch
  };
  const pipeline: PipelineStage[] = [
    { $match: match },
    {
      $addFields: {
        modeRank: {
          $switch: {
            branches: trainingModeRanks.map(({ mode, rank }) => ({
              case: { $eq: ['$mode', mode] },
              then: rank
            })),
            default: 999
          }
        }
      }
    },
    { $sort: { modeRank: 1, chunkIndex: 1, _id: 1 } },
    { $skip: offset },
    { $limit: pageSize },
    { $project: { modeRank: 0 } }
  ];

  const [errorList, total] = await Promise.all([
    MongoDatasetTraining.aggregate(pipeline, readFromSecondary),
    MongoDatasetTraining.countDocuments(match, { ...readFromSecondary })
  ]);

  return GetTrainingErrorResponseSchema.parse({
    total,
    list: errorList
  });
}

export default NextAPI(handler);
export type getTrainingErrorBody = GetTrainingErrorBody;
export type getTrainingErrorResponse = GetTrainingErrorResponse;
