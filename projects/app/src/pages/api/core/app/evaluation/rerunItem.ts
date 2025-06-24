import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoEvalItem } from '@fastgpt/service/core/app/evaluation/evalItemSchema';
import { MongoEvaluation } from '@fastgpt/service/core/app/evaluation/evalSchema';
import { checkEvaluationJobActive } from '@fastgpt/service/core/app/evaluation';
import { addLog } from '@fastgpt/service/common/system/log';
import { executeEvalItem } from '@fastgpt/service/core/app/evaluation/utils';

export type rerunEvalItemQuery = {};

export type rerunEvalItemBody = {
  evalItemId: string;
};

export type rerunEvalItemResponse = {
  message: string;
  status: 'queued' | 'processing';
};

async function handler(
  req: ApiRequestProps<rerunEvalItemBody, rerunEvalItemQuery>,
  res: ApiResponseType<any>
): Promise<rerunEvalItemResponse> {
  const { evalItemId } = req.body;

  const evaluationItem = await MongoEvalItem.findById(evalItemId);
  if (!evaluationItem) return Promise.reject('evaluationItem not found');

  const evaluation = await MongoEvaluation.findById(evaluationItem.evalId);
  if (!evaluation) return Promise.reject('evaluation not found');

  const { app } = await authApp({
    req,
    authToken: true,
    authApiKey: true,
    per: ManagePermissionVal,
    appId: evaluation.appId
  });

  try {
    const evalId = String(evaluation._id);
    const hasActiveJob = await checkEvaluationJobActive(evalId);

    if (hasActiveJob) {
      await MongoEvalItem.updateOne(
        { _id: evalItemId },
        {
          $set: {
            status: 0,
            errorMessage: null,
            response: null,
            accuracy: null,
            relevance: null,
            semanticAccuracy: null,
            score: null,
            retry: 3
          }
        }
      );

      return {
        message: 'EvalItem queued for rerun',
        status: 'queued'
      };
    } else {
      executeEvalItem({ evalItem: evaluationItem, evaluation, appName: app.name }).catch(
        (error) => {
          addLog.error('Background rerun failed', {
            evalItemId,
            evalId: String(evaluation._id),
            error: error.message
          });
        }
      );

      return {
        message: 'EvalItem rerun started',
        status: 'processing'
      };
    }
  } catch (error: any) {
    addLog.error('Rerun evalItem failed', { evalItemId, error: error.message });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
