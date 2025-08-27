import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoEvalDatasetData } from '@fastgpt/service/core/evaluation/evalDatasetDataSchema';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/evalDatasetCollectionSchema';
import { EvalDatasetDataCreateFromEnum } from '@fastgpt/global/core/evaluation/constants';
import type { createEvalDatasetDataBody } from '@fastgpt/global/core/evaluation/api';

export type EvalDatasetDataCreateQuery = {};
export type EvalDatasetDataCreateBody = createEvalDatasetDataBody;
export type EvalDatasetDataCreateResponse = string;

async function handler(
  req: ApiRequestProps<EvalDatasetDataCreateBody, EvalDatasetDataCreateQuery>
): Promise<EvalDatasetDataCreateResponse> {
  const { collectionId, user_input, actual_output, expected_output, context, retrieval_context } =
    req.body;

  if (!collectionId || typeof collectionId !== 'string') {
    return Promise.reject('collectionId is required and must be a string');
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
          user_input: user_input.trim(),
          actual_output: actual_output?.trim() || '',
          expected_output: expected_output.trim(),
          context: context || [],
          retrieval_context: retrieval_context || [],
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
