import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/evalDatasetCollectionSchema';
import type { updateEvalDatasetCollectionBody } from '@fastgpt/global/core/evaluation/api';

export type EvalDatasetCollectionUpdateQuery = {};
export type EvalDatasetCollectionUpdateBody = updateEvalDatasetCollectionBody;
export type EvalDatasetCollectionUpdateResponse = string;
async function handler(
  req: ApiRequestProps<EvalDatasetCollectionUpdateBody, EvalDatasetCollectionUpdateQuery>
): Promise<EvalDatasetCollectionUpdateResponse> {
  const { collectionId, name, description = '' } = req.body;

  // Parameter validation
  if (!collectionId || typeof collectionId !== 'string' || collectionId.trim().length === 0) {
    return Promise.reject({
      statusCode: 400,
      message: 'Collection ID is required and must be a non-empty string'
    });
  }

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

  // TODO: Authentication check - verify user is authenticated via cookie or token
  // TODO: Authorization check - verify user has write permissions for this resource
  const { teamId, tmbId } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true,
    per: WritePermissionVal
  });

  // TODO: Audit log - record the update operation for compliance and tracking

  // Check if collection exists and belongs to the team
  const existingCollection = await MongoEvalDatasetCollection.findOne({
    _id: collectionId,
    teamId
  });

  if (!existingCollection) {
    return Promise.reject({
      statusCode: 404,
      message: 'Dataset collection not found'
    });
  }

  // Check for name conflicts within team (excluding current collection)
  const nameConflict = await MongoEvalDatasetCollection.findOne({
    teamId,
    name: name.trim(),
    _id: { $ne: collectionId }
  });

  if (nameConflict) {
    return Promise.reject({
      statusCode: 500,
      message: 'A dataset with this name already exists'
    });
  }

  // Update dataset collection
  try {
    await mongoSessionRun(async (session) => {
      await MongoEvalDatasetCollection.updateOne(
        { _id: collectionId, teamId, tmbId },
        {
          $set: {
            name: name.trim(),
            description: description.trim(),
            updateTime: new Date()
          }
        },
        { session }
      );
    });

    return 'success';
  } catch (error) {
    return Promise.reject({
      statusCode: 500,
      message: 'Failed to update dataset collection'
    });
  }
}

export default NextAPI(handler);

// Export handler for testing
export const handler_test = process.env.NODE_ENV === 'test' ? handler : undefined;
