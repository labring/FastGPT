import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoEvalDatasetData } from '@fastgpt/service/core/evaluation/evalDatasetDataSchema';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/evalDatasetCollectionSchema';
import type { deleteEvalDatasetDataQuery } from '@fastgpt/global/core/evaluation/api';
import {
  removeEvalDatasetDataQualityJob,
  checkEvalDatasetDataQualityJobActive
} from '@fastgpt/service/core/evaluation/dataQualityMq';
import { addLog } from '@fastgpt/service/common/system/log';

export type EvalDatasetDataDeleteQuery = deleteEvalDatasetDataQuery;
export type EvalDatasetDataDeleteBody = {};
export type EvalDatasetDataDeleteResponse = string;

async function handler(
  req: ApiRequestProps<EvalDatasetDataDeleteBody, EvalDatasetDataDeleteQuery>
): Promise<EvalDatasetDataDeleteResponse> {
  const { dataId } = req.query;

  if (!dataId || typeof dataId !== 'string') {
    return Promise.reject({
      statusCode: 400,
      message: 'dataId is required and must be a string'
    });
  }

  const { teamId, tmbId } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true,
    per: WritePermissionVal
  });

  await mongoSessionRun(async (session) => {
    const existingData = await MongoEvalDatasetData.findById(dataId).session(session);

    if (!existingData) {
      return Promise.reject({
        statusCode: 404,
        message: 'Dataset data not found'
      });
    }

    const collection = await MongoEvalDatasetCollection.findOne({
      _id: existingData.datasetId,
      teamId
    }).session(session);

    if (!collection) {
      return Promise.reject({
        statusCode: 403,
        message: 'Access denied or dataset collection not found'
      });
    }

    const hasActiveQualityJob = await checkEvalDatasetDataQualityJobActive(dataId);

    if (hasActiveQualityJob) {
      addLog.info('Removing active quality evaluation job before deletion', {
        dataId,
        teamId
      });

      try {
        await removeEvalDatasetDataQualityJob(dataId);
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
      datasetId: existingData.datasetId,
      teamId
    });
  });

  return 'success';
}

export default NextAPI(handler);

// Export handler for testing
export const handler_test = process.env.NODE_ENV === 'test' ? handler : undefined;
