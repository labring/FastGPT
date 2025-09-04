import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoEvalDatasetData } from '@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema';
import {
  EvalDatasetDataCreateFromEnum,
  EvalDatasetDataKeyEnum
} from '@fastgpt/global/core/evaluation/dataset/constants';
import type { createEvalDatasetDataBody } from '@fastgpt/global/core/evaluation/dataset/api';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { authEvaluationDatasetDataCreate } from '@fastgpt/service/core/evaluation/common';

export type EvalDatasetDataCreateQuery = {};
export type EvalDatasetDataCreateBody = createEvalDatasetDataBody;
export type EvalDatasetDataCreateResponse = string;

async function handler(
  req: ApiRequestProps<EvalDatasetDataCreateBody, EvalDatasetDataCreateQuery>
): Promise<EvalDatasetDataCreateResponse> {
  const { collectionId, userInput, actualOutput, expectedOutput, context, retrievalContext } =
    req.body;

  const { teamId, tmbId } = await authEvaluationDatasetDataCreate(collectionId, {
    req,
    authToken: true,
    authApiKey: true
  });

  if (!collectionId || typeof collectionId !== 'string') {
    return Promise.reject('collectionId is required and must be a string');
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

  // Verify collection exists and belongs to the team
  const collection = await MongoEvalDatasetCollection.findOne({
    _id: collectionId,
    teamId
  });

  if (!collection) {
    return Promise.reject('Dataset collection not found or access denied');
  }

  const dataId = await mongoSessionRun(async (session) => {
    const [{ _id }] = await MongoEvalDatasetData.create(
      [
        {
          teamId,
          tmbId,
          datasetId: collectionId,
          [EvalDatasetDataKeyEnum.UserInput]: userInput.trim(),
          [EvalDatasetDataKeyEnum.ActualOutput]: actualOutput?.trim() || '',
          [EvalDatasetDataKeyEnum.ExpectedOutput]: expectedOutput.trim(),
          [EvalDatasetDataKeyEnum.Context]: context || [],
          [EvalDatasetDataKeyEnum.RetrievalContext]: retrievalContext || [],
          createFrom: EvalDatasetDataCreateFromEnum.manual
        }
      ],
      { session, ordered: true }
    );

    return _id;
  });

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
