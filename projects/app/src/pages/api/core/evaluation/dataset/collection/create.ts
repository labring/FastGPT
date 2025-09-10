import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema';
import type { createEvalDatasetCollectionBody } from '@fastgpt/global/core/evaluation/dataset/api';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { authEvaluationDatasetCreate } from '@fastgpt/service/core/evaluation/common';
import {
  checkTeamEvalDatasetLimit,
  checkTeamAIPoints
} from '@fastgpt/service/support/permission/teamLimit';

export type EvalDatasetCollectionCreateQuery = {};
export type EvalDatasetCollectionCreateBody = createEvalDatasetCollectionBody;
export type EvalDatasetCollectionCreateResponse = string;

async function handler(
  req: ApiRequestProps<EvalDatasetCollectionCreateBody, EvalDatasetCollectionCreateQuery>
): Promise<EvalDatasetCollectionCreateResponse> {
  const { name, description = '' } = req.body;

  const { teamId, tmbId } = await authEvaluationDatasetCreate({
    req,
    authApiKey: true,
    authToken: true
  });

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

  const existingDataset = await MongoEvalDatasetCollection.findOne({
    teamId,
    name: name.trim()
  });

  if (existingDataset) {
    return Promise.reject('A dataset with this name already exists');
  }

  // Check evaluation dataset limit
  await checkTeamEvalDatasetLimit(teamId);

  // Check AI points availability
  await checkTeamAIPoints(teamId);

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

  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.CREATE_EVALUATION_DATASET_COLLECTION,
      params: {
        collectionName: name.trim()
      }
    });
  })();

  return datasetId.toString();
}

export default NextAPI(handler);

// Export handler for testing
export const handler_test = process.env.NODE_ENV === 'test' ? handler : undefined;
