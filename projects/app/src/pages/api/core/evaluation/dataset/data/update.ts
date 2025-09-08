import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoEvalDatasetData } from '@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema';
import type { updateEvalDatasetDataBody } from '@fastgpt/global/core/evaluation/dataset/api';
import {
  addEvalDatasetDataQualityJob,
  removeEvalDatasetDataQualityJobsRobust
} from '@fastgpt/service/core/evaluation/dataset/dataQualityMq';
import { addLog } from '@fastgpt/service/common/system/log';
import { EvalDatasetDataKeyEnum } from '@fastgpt/global/core/evaluation/dataset/constants';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { authEvaluationDatasetDataUpdateById } from '@fastgpt/service/core/evaluation/common';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';

export type EvalDatasetDataUpdateQuery = {};
export type EvalDatasetDataUpdateBody = updateEvalDatasetDataBody;
export type EvalDatasetDataUpdateResponse = string;

async function handler(
  req: ApiRequestProps<EvalDatasetDataUpdateBody, EvalDatasetDataUpdateQuery>
): Promise<EvalDatasetDataUpdateResponse> {
  const {
    dataId,
    userInput,
    actualOutput,
    expectedOutput,
    context,
    retrievalContext,
    enableQualityEvaluation,
    qualityEvaluationModel
  } = req.body;

  const { teamId, tmbId } = await authEvaluationDatasetDataUpdateById(dataId, {
    req,
    authToken: true,
    authApiKey: true
  });

  if (!dataId || typeof dataId !== 'string') {
    return Promise.reject('dataId is required and must be a string');
  }

  if (!userInput || typeof userInput !== 'string' || userInput.trim().length === 0) {
    return Promise.reject('userInput is required and must be a non-empty string');
  }

  if (!expectedOutput || typeof expectedOutput !== 'string' || expectedOutput.trim().length === 0) {
    return Promise.reject('expectedOutput is required and must be a non-empty string');
  }

  if (actualOutput !== undefined && typeof actualOutput !== 'string') {
    return Promise.reject('actualOutput must be a string if provided');
  }

  if (
    context !== undefined &&
    (!Array.isArray(context) || !context.every((item) => typeof item === 'string'))
  ) {
    return Promise.reject('context must be an array of strings if provided');
  }

  if (
    retrievalContext !== undefined &&
    (!Array.isArray(retrievalContext) ||
      !retrievalContext.every((item) => typeof item === 'string'))
  ) {
    return Promise.reject('retrievalContext must be an array of strings if provided');
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

  let collectionName = '';

  await mongoSessionRun(async (session) => {
    const existingData = await MongoEvalDatasetData.findById(dataId).session(session);

    if (!existingData) {
      return Promise.reject(EvaluationErrEnum.evalDatasetDataNotFound);
    }

    const collection = await MongoEvalDatasetCollection.findOne({
      _id: existingData.datasetId,
      teamId
    }).session(session);

    if (!collection) {
      return Promise.reject(EvaluationErrEnum.evalDatasetCollectionNotFound);
    }

    collectionName = collection.name;

    await MongoEvalDatasetData.updateOne(
      { _id: dataId },
      {
        [EvalDatasetDataKeyEnum.UserInput]: userInput.trim(),
        [EvalDatasetDataKeyEnum.ActualOutput]: actualOutput?.trim() || '',
        [EvalDatasetDataKeyEnum.ExpectedOutput]: expectedOutput.trim(),
        [EvalDatasetDataKeyEnum.Context]: context || [],
        [EvalDatasetDataKeyEnum.RetrievalContext]: retrievalContext || [],
        updateTime: new Date()
      },
      { session }
    );

    if (enableQualityEvaluation && qualityEvaluationModel) {
      try {
        // Remove existing quality assessment task if any
        await removeEvalDatasetDataQualityJobsRobust([dataId], {
          forceCleanActiveJobs: true,
          retryDelay: 200
        });

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

  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.UPDATE_EVALUATION_DATASET_DATA,
      params: {
        collectionName
      }
    });
  })();

  return 'success';
}

export default NextAPI(handler);

// Export handler for testing
export const handler_test = process.env.NODE_ENV === 'test' ? handler : undefined;
