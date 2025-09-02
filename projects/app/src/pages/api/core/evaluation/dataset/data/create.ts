import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoEvalDatasetData } from '@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema';
import {
  EvalDatasetDataCreateFromEnum,
  EvalDatasetDataKeyEnum
} from '@fastgpt/global/core/evaluation/constants';
import type { createEvalDatasetDataBody } from '@fastgpt/global/core/evaluation/api';

export type EvalDatasetDataCreateQuery = {};
export type EvalDatasetDataCreateBody = createEvalDatasetDataBody;
export type EvalDatasetDataCreateResponse = string;

async function handler(
  req: ApiRequestProps<EvalDatasetDataCreateBody, EvalDatasetDataCreateQuery>
): Promise<EvalDatasetDataCreateResponse> {
  const { collectionId, userInput, actualOutput, expectedOutput, context, retrievalContext } =
    req.body;

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

  const { teamId, tmbId } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true,
    per: WritePermissionVal
  });

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

  // TODO: Add audit log for data creation
  // TODO: Add tracking for data creation metrics

  return dataId.toString();
}

export default NextAPI(handler);

// Export handler for testing
export const handler_test = process.env.NODE_ENV === 'test' ? handler : undefined;
