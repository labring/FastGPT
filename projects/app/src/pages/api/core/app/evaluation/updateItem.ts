import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoEvalItem } from '@fastgpt/service/core/app/evaluation/evalItemSchema';
import { MongoEvaluation } from '@fastgpt/service/core/app/evaluation/evalSchema';
import { checkEvaluationJobActive } from '@fastgpt/service/core/app/evaluation';
import { addLog } from '@fastgpt/service/common/system/log';
import { executeEvalItem } from '@fastgpt/service/core/app/evaluation/utils';
import { EvaluationStatusEnum } from '@fastgpt/global/core/app/evaluation/constants';

export type updateEvalItemQuery = {};

export type updateEvalItemBody = {
  evalItemId: string;
  question: string;
  expectedResponse: string;
  variables: Record<string, string>;
};

export type updateEvalItemResponse = {
  message: string;
  status: 'queued' | 'processing';
};

async function handler(
  req: ApiRequestProps<updateEvalItemBody, updateEvalItemQuery>,
  res: ApiResponseType<any>
): Promise<updateEvalItemResponse> {
  const { evalItemId, question, expectedResponse, variables } = req.body;

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
            question,
            expectedResponse,
            status: EvaluationStatusEnum.queuing,
            errorMessage: null,
            response: null,
            accuracy: null,
            relevance: null,
            semanticAccuracy: null,
            score: null,
            retry: 3,
            globalVariales: variables
          }
        }
      );

      return {
        message: 'EvalItem updated and queued for processing',
        status: 'queued'
      };
    } else {
      await MongoEvalItem.updateOne(
        { _id: evalItemId },
        {
          $set: {
            question,
            expectedResponse,
            globalVariales: variables
          }
        }
      );

      const updatedEvalItem = await MongoEvalItem.findById(evalItemId);
      if (!updatedEvalItem) return Promise.reject('Updated evaluationItem not found');

      executeEvalItem({
        evalItem: updatedEvalItem,
        evaluation,
        appName: app.name
      }).catch((error) => {
        addLog.error('Background update failed', {
          evalItemId,
          evalId: String(evaluation._id),
          error: error.message
        });
      });

      return {
        message: 'EvalItem updated and processing started',
        status: 'processing'
      };
    }
  } catch (error: any) {
    addLog.error('Update evalItem failed', { evalItemId, error: error.message });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
