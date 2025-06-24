import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import type { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { MongoEvalItem } from '@fastgpt/service/core/app/evaluation/evalItemSchema';
import { Types } from 'mongoose';
import { authApp } from '@fastgpt/service/support/permission/app/auth';

export type listEvalItemsQuery = {};

export type listEvalItemsBody = PaginationProps<{
  evalId: string;
  appId: string;
}>;

export type listEvalItemsResponse = PaginationResponse<listEvalItemsItem>;

export type listEvalItemsItem = {
  evalItemId: string;
  question: string;
  expectedResponse: string;
  response: string;
  variables: Record<string, string>;
  status: 0 | 1 | 2;
  errorMessage: string;

  accuracy: number;
  relevance: number;
  semanticAccuracy: number;
  score: number;
};

async function handler(
  req: ApiRequestProps<listEvalItemsBody, listEvalItemsQuery>,
  res: ApiResponseType<any>
): Promise<listEvalItemsResponse> {
  const { evalId, appId } = req.body;
  await authApp({
    req,
    authToken: true,
    authApiKey: true,
    per: ReadPermissionVal,
    appId
  });
  const { offset, pageSize } = parsePaginationRequest(req);

  const evalObjectId = new Types.ObjectId(evalId);

  const aggregationPipeline = [
    {
      $match: {
        evalId: evalObjectId
      }
    },
    {
      $skip: offset
    },
    {
      $limit: pageSize
    }
  ];

  const [result, total] = await Promise.all([
    MongoEvalItem.collection.aggregate(aggregationPipeline).toArray(),
    MongoEvalItem.countDocuments({ evalId: evalObjectId })
  ]);

  return {
    total,
    list: result.map((item) => ({
      evalItemId: String(item._id),
      question: item.question,
      expectedResponse: item.expectedResponse,
      response: item.response || '',
      variables: item.globalVariales || {},
      status: item.status,
      errorMessage: item.errorMessage || '',

      accuracy: item.accuracy || 0,
      relevance: item.relevance || 0,
      semanticAccuracy: item.semanticAccuracy || 0,
      score: item.score || 0
    }))
  };
}

export default NextAPI(handler);
