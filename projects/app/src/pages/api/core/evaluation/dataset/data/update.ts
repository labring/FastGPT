import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoEvalDatasetData } from '@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema';
import type { updateEvalDatasetDataBody } from '@fastgpt/global/core/evaluation/dataset/api';
import {
  EvalDatasetDataKeyEnum,
  EvalDatasetDataQualityStatusEnum,
  EvalDatasetDataQualityResultEnum
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
  qualityMetadata?: Record<string, any>;
}) {
  const {
    dataId,
    userInput,
    actualOutput,
    expectedOutput,
    context,
    retrievalContext,
    qualityMetadata
  } = params;
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
    qualityMetadata !== undefined &&
    (typeof qualityMetadata !== 'object' ||
      qualityMetadata === null ||
      Array.isArray(qualityMetadata))
  ) {
    throw EvaluationErrEnum.datasetDataMetadataMustBeObject;
  }
}

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
    qualityMetadata,
    synthesisMetadata,
    qualityResult
  } = req.body;

  validateRequestParams({
    dataId,
    userInput,
    actualOutput,
    expectedOutput,
    context,
    retrievalContext,
    qualityMetadata
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
      _id: existingData.evalDatasetCollectionId,
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

    // Handle quality result updates
    if (qualityResult !== undefined) {
      if (qualityResult === EvalDatasetDataQualityResultEnum.highQuality) {
        const currentQualityStatus = existingData.qualityMetadata?.status;
        if (
          currentQualityStatus === EvalDatasetDataQualityStatusEnum.queuing ||
          currentQualityStatus === EvalDatasetDataQualityStatusEnum.evaluating
        ) {
          return Promise.reject(EvaluationErrEnum.evalDataQualityJobActiveCannotSetHighQuality);
        }
      }
      updateFields.qualityResult = qualityResult;
    }

    // Handle quality metadata updates
    if (qualityMetadata !== undefined) {
      if (Object.keys(qualityMetadata).length > 0) {
        for (const [key, value] of Object.entries(qualityMetadata)) {
          updateFields[`qualityMetadata.${key}`] = value;
        }
      }
    }

    // Handle synthesis metadata updates
    if (synthesisMetadata !== undefined) {
      if (Object.keys(synthesisMetadata).length > 0) {
        for (const [key, value] of Object.entries(synthesisMetadata)) {
          updateFields[`synthesisMetadata.${key}`] = value;
        }
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
