import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema';
import type { updateEvalDatasetCollectionBody } from '@fastgpt/global/core/evaluation/dataset/api';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { authEvaluationDatasetWrite } from '@fastgpt/service/core/evaluation/common';

export type EvalDatasetCollectionUpdateQuery = {};
export type EvalDatasetCollectionUpdateBody = updateEvalDatasetCollectionBody;
export type EvalDatasetCollectionUpdateResponse = string;
async function handler(
  req: ApiRequestProps<EvalDatasetCollectionUpdateBody, EvalDatasetCollectionUpdateQuery>
): Promise<EvalDatasetCollectionUpdateResponse> {
  const { collectionId, name, description = '' } = req.body;

  const { teamId, tmbId } = await authEvaluationDatasetWrite(collectionId, {
    req,
    authApiKey: true,
    authToken: true
  });

  if (!collectionId || typeof collectionId !== 'string' || collectionId.trim().length === 0) {
    return Promise.reject('Collection ID is required and must be a non-empty string');
  }

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return Promise.reject('Name is required and must be a non-empty string');
  }

  if (name.trim().length > 100) {
    return Promise.reject('Name must be less than 100 characters');
  }

  if (description && typeof description !== 'string') {
    return Promise.reject('Description must be a string');
  }

  if (description && description.length > 100) {
    return Promise.reject('Description must be less than 100 characters');
  }

  // Check if collection exists and belongs to the team
  const existingCollection = await MongoEvalDatasetCollection.findOne({
    _id: collectionId,
    teamId
  });

  if (!existingCollection) {
    return Promise.reject('Dataset collection not found');
  }

  // Check for name conflicts within team (excluding current collection)
  const nameConflict = await MongoEvalDatasetCollection.findOne({
    teamId,
    name: name.trim(),
    _id: { $ne: collectionId }
  });

  if (nameConflict) {
    return Promise.reject('A dataset with this name already exists');
  }

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

    (async () => {
      addAuditLog({
        tmbId,
        teamId,
        event: AuditEventEnum.UPDATE_EVALUATION_DATASET_COLLECTION,
        params: {
          collectionName: name.trim()
        }
      });
    })();

    return 'success';
  } catch (error) {
    return Promise.reject('Failed to update dataset collection');
  }
}

export default NextAPI(handler);

// Export handler for testing
export const handler_test = process.env.NODE_ENV === 'test' ? handler : undefined;
