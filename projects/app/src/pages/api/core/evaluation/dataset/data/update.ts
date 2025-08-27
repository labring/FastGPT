import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoEvalDatasetData } from '@fastgpt/service/core/evaluation/evalDatasetDataSchema';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/evalDatasetCollectionSchema';
import type { updateEvalDatasetDataBody } from '@fastgpt/global/core/evaluation/api';
import {
  removeEvalDatasetDataQualityJob,
  addEvalDatasetDataQualityJob
} from '@fastgpt/service/core/evaluation/dataQualityMq';
import { addLog } from '@fastgpt/service/common/system/log';

export type EvalDatasetDataUpdateQuery = {};
export type EvalDatasetDataUpdateBody = updateEvalDatasetDataBody;
export type EvalDatasetDataUpdateResponse = string;

async function handler(
  req: ApiRequestProps<EvalDatasetDataUpdateBody, EvalDatasetDataUpdateQuery>
): Promise<EvalDatasetDataUpdateResponse> {
  const {
    dataId,
    user_input,
    actual_output,
    expected_output,
    context,
    retrieval_context,
    enableQualityEvaluation,
    qualityEvaluationModel
  } = req.body;

  if (!dataId || typeof dataId !== 'string') {
    return Promise.reject('dataId is required and must be a string');
  }

  if (!user_input || typeof user_input !== 'string' || user_input.trim().length === 0) {
    return Promise.reject('user_input is required and must be a non-empty string');
  }

  if (
    !expected_output ||
    typeof expected_output !== 'string' ||
    expected_output.trim().length === 0
  ) {
    return Promise.reject('expected_output is required and must be a non-empty string');
  }

  if (actual_output !== undefined && typeof actual_output !== 'string') {
    return Promise.reject('actual_output must be a string if provided');
  }

  if (
    context !== undefined &&
    (!Array.isArray(context) || !context.every((item) => typeof item === 'string'))
  ) {
    return Promise.reject('context must be an array of strings if provided');
  }

  if (
    retrieval_context !== undefined &&
    (!Array.isArray(retrieval_context) ||
      !retrieval_context.every((item) => typeof item === 'string'))
  ) {
    return Promise.reject('retrieval_context must be an array of strings if provided');
  }

  if (typeof enableQualityEvaluation !== 'boolean') {
    return Promise.reject('enableQualityEvaluation is required and must be a boolean');
  }

  if (
    enableQualityEvaluation &&
    (!qualityEvaluationModel || typeof qualityEvaluationModel !== 'string')
  ) {
    return Promise.reject(
      'qualityEvaluationModel is required when enableQualityEvaluation is true'
    );
  }

  const { teamId, tmbId } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true,
    per: WritePermissionVal
  });

  await mongoSessionRun(async (session) => {
    const existingData = await MongoEvalDatasetData.findById(dataId).session(session);

    if (!existingData) {
      return Promise.reject('Dataset data not found');
    }

    const collection = await MongoEvalDatasetCollection.findOne({
      _id: existingData.datasetId,
      teamId
    }).session(session);

    if (!collection) {
      return Promise.reject('Access denied or dataset collection not found');
    }

    await MongoEvalDatasetData.updateOne(
      { _id: dataId },
      {
        user_input: user_input.trim(),
        actual_output: actual_output?.trim() || '',
        expected_output: expected_output.trim(),
        context: context || [],
        retrieval_context: retrieval_context || [],
        updateTime: new Date()
      },
      { session }
    );

    if (enableQualityEvaluation && qualityEvaluationModel) {
      try {
        // Remove existing quality assessment task if any
        await removeEvalDatasetDataQualityJob(dataId);

        // Enqueue new quality assessment task
        await addEvalDatasetDataQualityJob({
          dataId,
          evalModel: qualityEvaluationModel
        });

        addLog.info('Quality evaluation task enqueued successfully', {
          dataId,
          evalModel: qualityEvaluationModel,
          teamId
        });
      } catch (error) {
        addLog.error('Failed to manage quality evaluation task', {
          dataId,
          evalModel: qualityEvaluationModel,
          teamId,
          error
        });
        // Note: We don't throw the error to prevent the update operation from failing
        // The data update should succeed even if quality evaluation task management fails
      }
    }
  });

  return 'success';
}

export default NextAPI(handler);

// Export handler for testing
export const handler_test = process.env.NODE_ENV === 'test' ? handler : undefined;
