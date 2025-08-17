import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { MongoEvalItem } from '@fastgpt/service/core/evaluation/evalItemSchema';
import { Types } from 'mongoose';
import { authEval } from '@fastgpt/service/support/permission/evaluation/auth';
import type { listEvalItemsBody } from '@fastgpt/global/core/evaluation/api';
import type { listEvalItemsItem } from '@fastgpt/global/core/evaluation/type';
import type { PaginationResponse } from '@fastgpt/web/common/fetch/type';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';

async function handler(
  req: ApiRequestProps<listEvalItemsBody, {}>,
  res: ApiResponseType<any>
): Promise<PaginationResponse<listEvalItemsItem>> {
  const { evalId } = req.body;
  await authEval({
    req,
    per: ReadPermissionVal,
    evalId,
    authToken: true,
    authApiKey: true
  });
  const { offset, pageSize } = parsePaginationRequest(req);

  const aggregationPipeline = [
    {
      $match: {
        evalId: new Types.ObjectId(evalId)
      }
    },
    {
      $addFields: {
        sortStatus: {
          $switch: {
            branches: [
              { case: { $ifNull: ['$errorMessage', false] }, then: 0 },
              { case: { $eq: ['$status', 1] }, then: 1 },
              { case: { $eq: ['$status', 0] }, then: 2 },
              { case: { $eq: ['$status', 2] }, then: 3 }
            ],
            default: 4
          }
        }
      }
    },
    {
      $sort: { sortStatus: 1 as const, _id: 1 as const }
    },
    {
      $skip: offset
    },
    {
      $limit: pageSize
    }
  ];

  const [result, total] = await Promise.all([
    MongoEvalItem.aggregate(aggregationPipeline),
    MongoEvalItem.countDocuments({ evalId })
  ]);

  return {
    total,
    list: result.map((item) => ({
      evalItemId: String(item._id),
      evalId: String(item.evalId),
      retry: item.retry,
      question: item.question,
      expectedResponse: item.expectedResponse,
      response: item.response,
      globalVariables: item.globalVariables,
      status: item.status,
      errorMessage: item.errorMessage,
      accuracy: item.accuracy,
      relevance: item.relevance,
      semanticAccuracy: item.semanticAccuracy,
      score: item.score
    }))
  };
}

export default NextAPI(handler);
