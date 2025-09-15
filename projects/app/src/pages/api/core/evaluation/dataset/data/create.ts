import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoEvalDatasetData } from '@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema';
import {
  EvalDatasetDataCreateFromEnum,
  EvalDatasetDataKeyEnum,
  EvalDatasetDataQualityStatusEnum
} from '@fastgpt/global/core/evaluation/dataset/constants';
import type { createEvalDatasetDataBody } from '@fastgpt/global/core/evaluation/dataset/api';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { authEvaluationDatasetDataCreate } from '@fastgpt/service/core/evaluation/common';
import {
  checkTeamEvalDatasetDataLimit,
  checkTeamAIPoints
} from '@fastgpt/service/support/permission/teamLimit';
import { addEvalDatasetDataQualityJob } from '@fastgpt/service/core/evaluation/dataset/dataQualityMq';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';

export type EvalDatasetDataCreateQuery = {};
export type EvalDatasetDataCreateBody = createEvalDatasetDataBody;
export type EvalDatasetDataCreateResponse = string;

function validateRequestParams(params: {
  collectionId?: string;
  userInput?: string;
  actualOutput?: string;
  expectedOutput?: string;
  context?: string[];
  retrievalContext?: string[];
  enableQualityEvaluation?: boolean;
  evaluationModel?: string;
}) {
  const {
    collectionId,
    userInput,
    actualOutput,
    expectedOutput,
    context,
    retrievalContext,
    enableQualityEvaluation,
    evaluationModel
  } = params;

  if (!collectionId || typeof collectionId !== 'string') {
    throw EvaluationErrEnum.datasetCollectionIdRequired;
  }

  if (!userInput || typeof userInput !== 'string') {
    throw EvaluationErrEnum.datasetDataUserInputRequired;
  }

  if (typeof userInput === 'string' && userInput.trim().length === 0) {
    throw EvaluationErrEnum.datasetDataUserInputRequired;
  }

  if (!expectedOutput || typeof expectedOutput !== 'string') {
    throw EvaluationErrEnum.datasetDataExpectedOutputRequired;
  }

  if (typeof expectedOutput === 'string' && expectedOutput.trim().length === 0) {
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

  if (typeof enableQualityEvaluation !== 'boolean') {
    throw EvaluationErrEnum.datasetDataEnableQualityEvalRequired;
  }

  if (enableQualityEvaluation && (!evaluationModel || typeof evaluationModel !== 'string')) {
    throw EvaluationErrEnum.datasetDataEvaluationModelRequiredForQuality;
  }

  if (evaluationModel && !global.llmModelMap.has(evaluationModel)) {
    throw EvaluationErrEnum.datasetModelNotFound;
  }
}

async function handler(
  req: ApiRequestProps<EvalDatasetDataCreateBody, EvalDatasetDataCreateQuery>
): Promise<EvalDatasetDataCreateResponse> {
  const {
    collectionId,
    userInput,
    actualOutput,
    expectedOutput,
    context,
    retrievalContext,
    enableQualityEvaluation,
    evaluationModel
  } = req.body;

  validateRequestParams({
    collectionId,
    userInput,
    actualOutput,
    expectedOutput,
    context,
    retrievalContext,
    enableQualityEvaluation,
    evaluationModel
  });

  const { teamId, tmbId } = await authEvaluationDatasetDataCreate(collectionId, {
    req,
    authToken: true,
    authApiKey: true
  });

  const collection = await MongoEvalDatasetCollection.findOne({
    _id: collectionId,
    teamId
  });

  if (!collection) {
    return Promise.reject(EvaluationErrEnum.datasetCollectionNotFound);
  }

  // Check evaluation data limit
  await checkTeamEvalDatasetDataLimit(teamId);

  if (enableQualityEvaluation && evaluationModel) {
    // Check AI points availability
    await checkTeamAIPoints(teamId);
  }

  const dataId = await mongoSessionRun(async (session) => {
    const [{ _id }] = await MongoEvalDatasetData.create(
      [
        {
          teamId,
          tmbId,
          evalDatasetCollectionId: collectionId,
          [EvalDatasetDataKeyEnum.UserInput]: userInput.trim(),
          [EvalDatasetDataKeyEnum.ActualOutput]:
            (typeof actualOutput === 'string' ? actualOutput.trim() : '') || '',
          [EvalDatasetDataKeyEnum.ExpectedOutput]: expectedOutput.trim(),
          [EvalDatasetDataKeyEnum.Context]: context || [],
          [EvalDatasetDataKeyEnum.RetrievalContext]: retrievalContext || [],
          createFrom: EvalDatasetDataCreateFromEnum.manual,
          metadata: {
            ...(enableQualityEvaluation
              ? {}
              : { qualityStatus: EvalDatasetDataQualityStatusEnum.unevaluated })
          }
        }
      ],
      { session, ordered: true }
    );

    return _id;
  });

  if (enableQualityEvaluation && evaluationModel) {
    await addEvalDatasetDataQualityJob({
      dataId: dataId.toString(),
      evaluationModel: evaluationModel
    });
  }

  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.CREATE_EVALUATION_DATASET_DATA,
      params: {
        collectionName: collection.name
      }
    });
  })();

  return dataId.toString();
}

export default NextAPI(handler);

// Export handler for testing
export const handler_test = process.env.NODE_ENV === 'test' ? handler : undefined;
