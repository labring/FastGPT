import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema';
import type { createEvalDatasetCollectionBody } from '@fastgpt/global/core/evaluation/dataset/api';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { authEvaluationDatasetCreate } from '@fastgpt/service/core/evaluation/common';
import { checkTeamEvalDatasetLimit } from '@fastgpt/service/support/permission/teamLimit';
import { getDefaultEvaluationModel } from '@fastgpt/service/core/ai/model';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';
import {
  MAX_NAME_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_MODEL_NAME_LENGTH
} from '@fastgpt/global/core/evaluation/constants';

export type EvalDatasetCollectionCreateQuery = {};
export type EvalDatasetCollectionCreateBody = createEvalDatasetCollectionBody;
export type EvalDatasetCollectionCreateResponse = string;

function validateRequestParams(params: {
  name?: string;
  description?: string;
  evaluationModelId?: string;
}) {
  const { name, description, evaluationModelId } = params;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    throw EvaluationErrEnum.evalNameRequired;
  }

  if (name.trim().length > MAX_NAME_LENGTH) {
    throw EvaluationErrEnum.evalNameTooLong;
  }

  if (description && typeof description !== 'string') {
    throw EvaluationErrEnum.evalDescriptionInvalidType;
  }

  if (description && description.length > MAX_DESCRIPTION_LENGTH) {
    throw EvaluationErrEnum.evalDescriptionTooLong;
  }

  if (evaluationModelId && typeof evaluationModelId !== 'string') {
    throw EvaluationErrEnum.evalModelNameInvalid;
  }

  if (evaluationModelId && evaluationModelId.length > MAX_MODEL_NAME_LENGTH) {
    throw EvaluationErrEnum.evalModelNameTooLong;
  }
}

async function handler(
  req: ApiRequestProps<EvalDatasetCollectionCreateBody, EvalDatasetCollectionCreateQuery>
): Promise<EvalDatasetCollectionCreateResponse> {
  const { name, description = '', evaluationModelId } = req.body;

  const { teamId, tmbId } = await authEvaluationDatasetCreate({
    req,
    authApiKey: true,
    authToken: true
  });

  validateRequestParams({ name, description, evaluationModelId });

  if (evaluationModelId) {
    if (!global.llmModelIdMap.has(evaluationModelId)) {
      return Promise.reject(EvaluationErrEnum.datasetModelNotFound);
    }
  }

  const existingDataset = await MongoEvalDatasetCollection.findOne({
    teamId,
    name: name.trim()
  });

  if (existingDataset) {
    return Promise.reject(EvaluationErrEnum.evalDuplicateDatasetName);
  }

  // Check evaluation dataset limit
  await checkTeamEvalDatasetLimit(teamId);

  const defaultEvaluationModel = getDefaultEvaluationModel();
  const modelToUse = evaluationModelId || defaultEvaluationModel?.model;

  const datasetId = await mongoSessionRun(async (session) => {
    const [{ _id }] = await MongoEvalDatasetCollection.create(
      [
        {
          teamId,
          tmbId,
          name: name.trim(),
          description: description.trim(),
          ...(modelToUse && { evaluationModelId: modelToUse })
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
