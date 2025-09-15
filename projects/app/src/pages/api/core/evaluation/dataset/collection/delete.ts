import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema';
import { MongoEvalDatasetData } from '@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema';
import type { deleteEvalDatasetCollectionQuery } from '@fastgpt/global/core/evaluation/dataset/api';
import { removeEvalDatasetSmartGenerateJobsRobust } from '@fastgpt/service/core/evaluation/dataset/smartGenerateMq';
import { removeEvalDatasetDataQualityJobsRobust } from '@fastgpt/service/core/evaluation/dataset/dataQualityMq';
import { removeEvalDatasetDataSynthesizeJobsRobust } from '@fastgpt/service/core/evaluation/dataset/dataSynthesizeMq';
import { addLog } from '@fastgpt/service/common/system/log';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { authEvaluationDatasetWrite } from '@fastgpt/service/core/evaluation/common';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';

export type EvalDatasetCollectionDeleteQuery = deleteEvalDatasetCollectionQuery;
export type EvalDatasetCollectionDeleteBody = {};
export type EvalDatasetCollectionDeleteResponse = string;

async function handler(
  req: ApiRequestProps<EvalDatasetCollectionDeleteBody, EvalDatasetCollectionDeleteQuery>
): Promise<EvalDatasetCollectionDeleteResponse> {
  const { collectionId } = req.query;

  if (!collectionId || typeof collectionId !== 'string' || collectionId.trim().length === 0) {
    return Promise.reject(EvaluationErrEnum.datasetCollectionIdRequired);
  }

  const { teamId, tmbId } = await authEvaluationDatasetWrite(collectionId, {
    req,
    authApiKey: true,
    authToken: true
  });

  let collectionName = '';

  await mongoSessionRun(async (session) => {
    const collection = await MongoEvalDatasetCollection.findOne({
      _id: collectionId,
      teamId
    }).session(session);

    if (!collection) {
      return Promise.reject(EvaluationErrEnum.datasetCollectionNotFound);
    }

    collectionName = collection.name;

    addLog.info('Starting evaluation dataset collection deletion', {
      collectionId,
      teamId,
      tmbId,
      collectionName: collection.name
    });

    addLog.info('Cleaning up smart generation queue tasks', { collectionId });
    try {
      await removeEvalDatasetSmartGenerateJobsRobust([collectionId], {
        forceCleanActiveJobs: true,
        retryAttempts: 3,
        retryDelay: 200
      });
      addLog.info('Smart generation queue cleanup completed', { collectionId });
    } catch (error) {
      addLog.error('Failed to clean up smart generation queue', {
        collectionId,
        error
      });
    }

    addLog.info('Cleaning up quality assessment queue tasks', { collectionId });
    try {
      const datasetDataIds = await MongoEvalDatasetData.find(
        { evalDatasetCollectionId: collectionId },
        { _id: 1 }
      ).session(session);

      const dataIds = datasetDataIds.map((data) => data._id.toString());

      if (dataIds.length > 0) {
        await removeEvalDatasetDataQualityJobsRobust(dataIds, {
          forceCleanActiveJobs: true,
          retryAttempts: 3,
          retryDelay: 200
        });
        addLog.info('Quality assessment queue cleanup completed', {
          collectionId,
          dataCount: dataIds.length
        });
      }
    } catch (error) {
      addLog.error('Failed to clean up quality assessment queue', {
        collectionId,
        error
      });
    }

    addLog.info('Cleaning up data synthesis queue tasks', { collectionId });
    try {
      await removeEvalDatasetDataSynthesizeJobsRobust([collectionId], {
        forceCleanActiveJobs: true,
        retryAttempts: 3,
        retryDelay: 200
      });
      addLog.info('Data synthesis queue cleanup completed', { collectionId });
    } catch (error) {
      addLog.error('Failed to clean up data synthesis queue', {
        collectionId,
        error
      });
    }

    const deletedDataResult = await MongoEvalDatasetData.deleteMany(
      { evalDatasetCollectionId: collectionId },
      { session }
    );

    addLog.info('Evaluation dataset data deleted', {
      collectionId,
      deletedCount: deletedDataResult.deletedCount
    });

    await MongoEvalDatasetCollection.deleteOne({ _id: collectionId }, { session });

    addLog.info('Evaluation dataset collection deleted successfully', {
      collectionId,
      teamId,
      tmbId,
      collectionName: collection.name,
      deletedDataCount: deletedDataResult.deletedCount
    });
  });

  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.DELETE_EVALUATION_DATASET_COLLECTION,
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
