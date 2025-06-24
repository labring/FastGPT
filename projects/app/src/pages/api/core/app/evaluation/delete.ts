import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoEvaluation } from '@fastgpt/service/core/app/evaluation/evalSchema';
import { Types } from 'mongoose';
import { MongoEvalItem } from '@fastgpt/service/core/app/evaluation/evalItemSchema';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { addAuditLog, getI18nAppType } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

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

  const { tmbId, teamId, app } = await authApp({
    req,
    authToken: true,
    authApiKey: true,
    per: ManagePermissionVal,
    appId: evaluation?.appId
  });

  await MongoEvaluation.deleteOne({
    _id: new Types.ObjectId(evalId)
  });

  await MongoEvalItem.deleteMany({
    evalId
  });

  addAuditLog({
    tmbId,
    teamId,
    event: AuditEventEnum.EXPORT_EVALUATION,
    params: {
      appName: app.name,
      appType: getI18nAppType(app.type)
    }
  });

  return {};
}

export default NextAPI(handler);
