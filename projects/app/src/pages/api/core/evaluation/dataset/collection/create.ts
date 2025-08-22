import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/evalDatasetCollectionSchema';
import type { createEvalDatasetCollectionBody } from '@fastgpt/global/core/evaluation/api';

export type EvalDatasetCollectionCreateQuery = {};
export type EvalDatasetCollectionCreateBody = createEvalDatasetCollectionBody;
export type EvalDatasetCollectionCreateResponse = string;

async function handler(
  req: ApiRequestProps<EvalDatasetCollectionCreateBody, EvalDatasetCollectionCreateQuery>
): Promise<EvalDatasetCollectionCreateResponse> {
  const { name, description = '' } = req.body;

  // Parameter validation
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return Promise.reject({
      statusCode: 400,
      message: 'Name is required and must be a non-empty string'
    });
  }

  if (name.trim().length > 100) {
    return Promise.reject({
      statusCode: 400,
      message: 'Name must be less than 100 characters'
    });
  }

  if (description && typeof description !== 'string') {
    return Promise.reject({
      statusCode: 400,
      message: 'Description must be a string'
    });
  }

  if (description && description.length > 500) {
    return Promise.reject({
      statusCode: 400,
      message: 'Description must be less than 500 characters'
    });
  }

  // Authentication and authorization
  const { teamId, tmbId } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true,
    per: WritePermissionVal
  });

  // Check for name conflicts within team
  const existingDataset = await MongoEvalDatasetCollection.findOne({
    teamId,
    name: name.trim()
  });

  if (existingDataset) {
    return Promise.reject({
      statusCode: 409,
      message: 'A dataset with this name already exists'
    });
  }

  // Create dataset collection
  const datasetId = await mongoSessionRun(async (session) => {
    const [{ _id }] = await MongoEvalDatasetCollection.create(
      [
        {
          teamId,
          tmbId,
          name: name.trim(),
          description: description.trim()
        }
      ],
      { session, ordered: true }
    );

    return _id;
  });

  // TODO: Add audit log

  return datasetId.toString();
}

export default NextAPI(handler);

// Export handler for testing
export const handler_test = process.env.NODE_ENV === 'test' ? handler : undefined;
