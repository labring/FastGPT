import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema';
import { Types } from '@fastgpt/service/common/mongo';
import type {
  retryAllTaskBody,
  retryAllTaskResponse
} from '@fastgpt/global/core/evaluation/dataset/api';
import { evalDatasetDataSynthesizeQueue } from '@fastgpt/service/core/evaluation/dataset/dataSynthesizeMq';
import { addLog } from '@fastgpt/service/common/system/log';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { authEvaluationDatasetWrite } from '@fastgpt/service/core/evaluation/common';
import { checkTeamAIPoints } from '@fastgpt/service/support/permission/teamLimit';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';

async function handler(req: ApiRequestProps<retryAllTaskBody, {}>): Promise<retryAllTaskResponse> {
  const { collectionId } = req.body;

  const { teamId, tmbId } = await authEvaluationDatasetWrite(collectionId, {
    req,
    authApiKey: true,
    authToken: true
  });

  // Check AI points availability
  await checkTeamAIPoints(teamId);

  const collection = await MongoEvalDatasetCollection.findOne({
    _id: new Types.ObjectId(collectionId),
    teamId: new Types.ObjectId(teamId)
  });

  if (!collection) {
    return Promise.reject(EvaluationErrEnum.datasetCollectionNotFound);
  }

  try {
    const failedJobs = await evalDatasetDataSynthesizeQueue.getJobs(['failed']);
    const collectionFailedJobs = failedJobs.filter(
      (job) => job.data.evalDatasetCollectionId === collectionId
    );

    const totalFailedTasks = collectionFailedJobs.length;

    if (totalFailedTasks === 0) {
      return {
        success: true,
        message: 'No failed tasks found to retry',
        totalFailedTasks: 0,
        retriedTasks: 0,
        failedRetries: 0
      };
    }

    let retriedTasks = 0;
    let failedRetries = 0;

    for (const job of collectionFailedJobs) {
      try {
        await job.retry();
        retriedTasks++;
      } catch (error) {
        failedRetries++;
        addLog.error('Failed to retry individual task', {
          jobId: job.id,
          collectionId,
          teamId,
          error
        });
      }
    }

    addLog.info('All failed tasks retry completed', {
      collectionId,
      teamId,
      totalFailedTasks,
      retriedTasks,
      failedRetries
    });

    (async () => {
      addAuditLog({
        tmbId,
        teamId,
        event: AuditEventEnum.RETRY_EVALUATION_DATASET_TASK,
        params: {
          collectionName: collection.name
        }
      });
    })();

    return {
      success: true,
      message: `Retried ${retriedTasks} of ${totalFailedTasks} failed tasks successfully`,
      totalFailedTasks,
      retriedTasks,
      failedRetries
    };
  } catch (error) {
    addLog.error('Failed to retry all tasks', {
      collectionId,
      teamId,
      error
    });
    return Promise.reject(EvaluationErrEnum.datasetTaskOperationFailed);
  }
}

export default NextAPI(handler);

// Export handler for testing
export const handler_test = process.env.NODE_ENV === 'test' ? handler : undefined;
