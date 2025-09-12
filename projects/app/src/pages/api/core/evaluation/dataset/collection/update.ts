import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema';
import type { updateEvalDatasetCollectionBody } from '@fastgpt/global/core/evaluation/dataset/api';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { authEvaluationDatasetWrite } from '@fastgpt/service/core/evaluation/common';
import {
  MAX_NAME_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_MODEL_NAME_LENGTH
} from '@fastgpt/global/core/evaluation/constants';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';
import { addLog } from '@fastgpt/service/common/system/log';

export type EvalDatasetCollectionUpdateQuery = {};
export type EvalDatasetCollectionUpdateBody = updateEvalDatasetCollectionBody;
export type EvalDatasetCollectionUpdateResponse = string;

function validateUpdateParams(params: {
  collectionId?: string;
  name?: string;
  description?: string;
  evaluationModel?: string;
}) {
  const { collectionId, name, description, evaluationModel } = params;

  if (!collectionId || typeof collectionId !== 'string' || collectionId.trim().length === 0) {
    throw EvaluationErrEnum.datasetCollectionIdRequired;
  }

  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim().length === 0) {
      throw EvaluationErrEnum.evalNameRequired;
    }

    if (name.trim().length > MAX_NAME_LENGTH) {
      throw EvaluationErrEnum.evalNameTooLong;
    }
  }

  if (description && typeof description !== 'string') {
    throw EvaluationErrEnum.evalDescriptionInvalidType;
  }

  if (description && description.length > MAX_DESCRIPTION_LENGTH) {
    throw EvaluationErrEnum.evalDescriptionTooLong;
  }

  if (evaluationModel && typeof evaluationModel !== 'string') {
    throw EvaluationErrEnum.evalModelNameInvalid;
  }

  if (evaluationModel && evaluationModel.length > MAX_MODEL_NAME_LENGTH) {
    throw EvaluationErrEnum.evalModelNameTooLong;
  }

  if (evaluationModel) {
    if (!global.llmModelMap.has(evaluationModel)) {
      throw EvaluationErrEnum.datasetModelNotFound;
    }
  }
}

async function handler(
  req: ApiRequestProps<EvalDatasetCollectionUpdateBody, EvalDatasetCollectionUpdateQuery>
): Promise<EvalDatasetCollectionUpdateResponse> {
  const { collectionId, name, description = '', evaluationModel } = req.body;

  const { teamId, tmbId } = await authEvaluationDatasetWrite(collectionId, {
    req,
    authApiKey: true,
    authToken: true
  });

  validateUpdateParams({ collectionId, name, description, evaluationModel });

  const existingCollection = await MongoEvalDatasetCollection.findOne({
    _id: collectionId,
    teamId
  });

  if (!existingCollection) {
    return Promise.reject(EvaluationErrEnum.datasetCollectionNotFound);
  }

  if (name !== undefined) {
    const nameConflict = await MongoEvalDatasetCollection.findOne({
      teamId,
      name: name.trim(),
      _id: { $ne: collectionId }
    });

    if (nameConflict) {
      return Promise.reject(EvaluationErrEnum.evalDuplicateDatasetName);
    }
  }

  try {
    await mongoSessionRun(async (session) => {
      await MongoEvalDatasetCollection.updateOne(
        { _id: collectionId, teamId, tmbId },
        {
          $set: {
            description: description.trim(),
            updateTime: new Date(),
            ...(name !== undefined && { name: name.trim() }),
            ...(evaluationModel !== undefined && { evaluationModel: evaluationModel.trim() })
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
          collectionName: name !== undefined ? name.trim() : existingCollection.name
        }
      });
    })();

    return 'success';
  } catch (error) {
    addLog.error('Update evaluation dataset collection failed', error);
    return Promise.reject(EvaluationErrEnum.datasetCollectionUpdateFailed);
  }
}

export default NextAPI(handler);

// Export handler for testing
export const handler_test = process.env.NODE_ENV === 'test' ? handler : undefined;
