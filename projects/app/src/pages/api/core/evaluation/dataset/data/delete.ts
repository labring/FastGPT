import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoEvalDatasetData } from '@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema';
import type { deleteEvalDatasetDataQuery } from '@fastgpt/global/core/evaluation/dataset/api';
import {
  checkEvalDatasetDataQualityJobActive,
  removeEvalDatasetDataQualityJobsRobust
} from '@fastgpt/service/core/evaluation/dataset/dataQualityMq';
import { addLog } from '@fastgpt/service/common/system/log';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { authEvaluationDatasetDataUpdateById } from '@fastgpt/service/core/evaluation/common';

export type EvalDatasetDataDeleteQuery = deleteEvalDatasetDataQuery;
export type EvalDatasetDataDeleteBody = {};
export type EvalDatasetDataDeleteResponse = string;

async function handler(
  req: ApiRequestProps<EvalDatasetDataDeleteBody, EvalDatasetDataDeleteQuery>
): Promise<EvalDatasetDataDeleteResponse> {
  const { dataId } = req.query;

  const { teamId, tmbId, collectionId } = await authEvaluationDatasetDataUpdateById(dataId, {
    req,
    authToken: true,
    authApiKey: true
  });

  if (!dataId || typeof dataId !== 'string' || dataId.trim().length === 0) {
    return Promise.reject('dataId is required and must be a string');
  }

  let collectionName = '';

  await mongoSessionRun(async (session) => {
    const existingData = await MongoEvalDatasetData.findById(dataId).session(session);

    if (!existingData) {
      return Promise.reject('Dataset data not found');
    }

    const collection = await MongoEvalDatasetCollection.findOne({
      _id: existingData.datasetId,
      teamId
    }).session(session);

    if (!collection) {
      return Promise.reject('Access denied or dataset collection not found');
    }

    collectionName = collection.name;

    const hasActiveQualityJob = await checkEvalDatasetDataQualityJobActive(dataId);

    if (hasActiveQualityJob) {
      addLog.info('Removing active quality evaluation job before deletion', {
        dataId,
        teamId
      });

      try {
        await removeEvalDatasetDataQualityJobsRobust([dataId]);
        addLog.info('Quality evaluation job removed successfully before deletion', {
          dataId,
          teamId
        });
      } catch (error) {
        addLog.error('Failed to remove quality evaluation job before deletion', {
          dataId,
          teamId,
          error
        });
        // Continue with deletion even if queue removal fails
      }
    }

    await MongoEvalDatasetData.deleteOne({ _id: dataId }, { session });

    addLog.info('Evaluation dataset data deleted successfully', {
      dataId,
      datasetId: collectionId,
      teamId
    });
  });

  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.DELETE_EVALUATION_DATASET_DATA,
      params: {
        collectionName
      }
    });
  })();

  return 'success';
}

export default NextAPI(handler);

// Export handler for testing
export const handler_test = process.env.NODE_ENV === 'test' ? handler : undefined;
