import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoEvaluation } from '@fastgpt/service/core/app/evaluation/evalSchema';
import { Types } from 'mongoose';
import { MongoEvalItem } from '@fastgpt/service/core/app/evaluation/evalItemSchema';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
// import { removeEvaluationJob } from '@fastgpt/service/core/app/evaluation';

export type deleteEvaluationQuery = {
  evalId: string;
};

export type deleteEvaluationBody = {};

export type deleteEvaluationResponse = {};

async function handler(
  req: ApiRequestProps<deleteEvaluationBody, deleteEvaluationQuery>,
  res: ApiResponseType<any>
): Promise<deleteEvaluationResponse> {
  const { evalId } = req.query;

  const evaluation = await MongoEvaluation.findById(evalId);
  if (!evaluation) return Promise.reject('Evaluation not found');

  await authApp({
    req,
    authToken: true,
    authApiKey: true,
    per: ManagePermissionVal,
    appId: evaluation?.appId
  });

  // await removeEvaluationJob(evalId);

  await MongoEvaluation.deleteOne({
    _id: new Types.ObjectId(evalId)
  });

  await MongoEvalItem.deleteMany({
    evalId
  });

  return {};
}

export default NextAPI(handler);
