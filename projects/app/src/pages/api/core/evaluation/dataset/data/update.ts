import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoEvalDatasetData } from '@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema';
import type { updateEvalDatasetDataBody } from '@fastgpt/global/core/evaluation/dataset/api';
import {
  EvalDatasetDataKeyEnum,
  EvalDatasetDataQualityStatusEnum
} from '@fastgpt/global/core/evaluation/dataset/constants';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { authEvaluationDatasetDataUpdateById } from '@fastgpt/service/core/evaluation/common';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';

export type EvalDatasetDataUpdateQuery = {};
export type EvalDatasetDataUpdateBody = updateEvalDatasetDataBody;
export type EvalDatasetDataUpdateResponse = string;

function validateRequestParams(params: {
  dataId?: string;
  userInput?: string;
  actualOutput?: string;
  expectedOutput?: string;
  context?: string[];
  retrievalContext?: string[];
  metadata?: Record<string, any>;
}) {
  const { dataId, userInput, actualOutput, expectedOutput, context, retrievalContext, metadata } =
    params;
  if (!dataId || typeof dataId !== 'string') {
    throw EvaluationErrEnum.datasetDataIdRequired;
  }

  if (!userInput || typeof userInput !== 'string' || userInput.trim().length === 0) {
    throw EvaluationErrEnum.datasetDataUserInputRequired;
  }

  if (!expectedOutput || typeof expectedOutput !== 'string' || expectedOutput.trim().length === 0) {
    throw EvaluationErrEnum.datasetDataExpectedOutputRequired;
  }

  if (actualOutput !== undefined && typeof actualOutput !== 'string') {
    throw EvaluationErrEnum.datasetDataActualOutputMustBeString;
  }

  if (
    context !== undefined &&
    (!Array.isArray(context) || !context.every((item) => typeof item === 'string'))
  ) {
    throw EvaluationErrEnum.datasetDataContextMustBeArrayOfStrings;
  }

  if (
    retrievalContext !== undefined &&
    (!Array.isArray(retrievalContext) ||
      !retrievalContext.every((item) => typeof item === 'string'))
  ) {
    throw EvaluationErrEnum.datasetDataRetrievalContextMustBeArrayOfStrings;
  }

  if (
    metadata !== undefined &&
    (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata))
  ) {
    throw EvaluationErrEnum.datasetDataMetadataMustBeObject;
  }
}

async function handler(
  req: ApiRequestProps<EvalDatasetDataUpdateBody, EvalDatasetDataUpdateQuery>
): Promise<EvalDatasetDataUpdateResponse> {
  const { dataId, userInput, actualOutput, expectedOutput, context, retrievalContext, metadata } =
    req.body;

  validateRequestParams({
    dataId,
    userInput,
    actualOutput,
    expectedOutput,
    context,
    retrievalContext,
    metadata
  });

  const { teamId, tmbId } = await authEvaluationDatasetDataUpdateById(dataId, {
    req,
    authToken: true,
    authApiKey: true
  });

  let collectionName = '';

  await mongoSessionRun(async (session) => {
    const existingData = await MongoEvalDatasetData.findById(dataId).session(session);

    if (!existingData) {
      return Promise.reject(EvaluationErrEnum.datasetDataNotFound);
    }

    const collection = await MongoEvalDatasetCollection.findOne({
      _id: existingData.datasetId,
      teamId
    }).session(session);

    if (!collection) {
      return Promise.reject(EvaluationErrEnum.datasetCollectionNotFound);
    }

    collectionName = collection.name;

    const updateFields: Record<string, any> = {
      [EvalDatasetDataKeyEnum.UserInput]: userInput.trim(),
      [EvalDatasetDataKeyEnum.ActualOutput]: actualOutput?.trim() || '',
      [EvalDatasetDataKeyEnum.ExpectedOutput]: expectedOutput.trim(),
      [EvalDatasetDataKeyEnum.Context]: context || [],
      [EvalDatasetDataKeyEnum.RetrievalContext]: retrievalContext || [],
      updateTime: new Date()
    };

    if (metadata !== undefined) {
      if (Object.keys(metadata).length > 0) {
        for (const [key, value] of Object.entries(metadata)) {
          if (key == 'qualityStatus' && value == EvalDatasetDataQualityStatusEnum.highQuality) {
            const currentQualityStatus = existingData.metadata?.qualityStatus;
            if (
              currentQualityStatus === EvalDatasetDataQualityStatusEnum.queuing ||
              currentQualityStatus === EvalDatasetDataQualityStatusEnum.evaluating
            ) {
              return Promise.reject(EvaluationErrEnum.evalDataQualityJobActiveCannotSetHighQuality);
            }
          }
          updateFields[`metadata.${key}`] = value;
        }
      } else {
        updateFields.metadata = {};
      }
    }

    await MongoEvalDatasetData.updateOne({ _id: dataId }, { $set: updateFields }, { session });
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
