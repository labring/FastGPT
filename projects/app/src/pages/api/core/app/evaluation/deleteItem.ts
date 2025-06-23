import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoEvalItem } from '@fastgpt/service/core/app/evaluation/evalItemSchema';
import { MongoEvaluation } from '@fastgpt/service/core/app/evaluation/evalSchema';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';

export type deleteItemQuery = {
  evalItemId: string;
};

export type deleteItemBody = {};

export type deleteItemResponse = {};

async function handler(
  req: ApiRequestProps<deleteItemBody, deleteItemQuery>,
  res: ApiResponseType<any>
): Promise<deleteItemResponse> {
  const { evalItemId } = req.query;

  const evaluationItem = await MongoEvalItem.findById(evalItemId);
  if (!evaluationItem) return Promise.reject('evaluationItem not found');

  const evaluation = await MongoEvaluation.findById(evaluationItem.evalId);
  if (!evaluation) return Promise.reject('evaluation not found');

  await authApp({
    req,
    authToken: true,
    authApiKey: true,
    per: ManagePermissionVal,
    appId: evaluation?.appId
  });

  await MongoEvalItem.deleteOne({ _id: evalItemId });

  return {};
}

export default NextAPI(handler);
