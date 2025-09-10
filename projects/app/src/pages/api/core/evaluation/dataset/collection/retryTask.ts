import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema';
import { Types } from '@fastgpt/service/common/mongo';
import type { retryTaskBody } from '@fastgpt/global/core/evaluation/dataset/api';
import { evalDatasetDataSynthesizeQueue } from '@fastgpt/service/core/evaluation/dataset/dataSynthesizeMq';
import { addLog } from '@fastgpt/service/common/system/log';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { authEvaluationDatasetWrite } from '@fastgpt/service/core/evaluation/common';
import { checkTeamAIPoints } from '@fastgpt/service/support/permission/teamLimit';

async function handler(
  req: ApiRequestProps<retryTaskBody, {}>
): Promise<{ success: boolean; message: string }> {
  const { collectionId, jobId } = req.body;

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
    throw new Error('Evaluation dataset not found or access denied');
  }

  try {
    const job = await evalDatasetDataSynthesizeQueue.getJob(jobId);

    if (!job) {
      return {
        success: false,
        message: 'Task not found'
      };
    }

    if (job.data.evalDatasetCollectionId !== collectionId) {
      return {
        success: false,
        message: 'Task does not belong to the specified dataset collection'
      };
    }

    if (!job.isFailed()) {
      return {
        success: false,
        message: 'Only failed tasks can be retried'
      };
    }

    await job.retry();

    addLog.info('Task retried successfully', {
      jobId,
      collectionId,
      teamId
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
      message: 'Task retried successfully'
    };
  } catch (error) {
    addLog.error('Failed to retry task', {
      jobId,
      collectionId,
      teamId,
      error
    });

    return {
      success: false,
      message: 'Failed to retry task'
    };
  }
}

export default NextAPI(handler);

// Export handler for testing
export const handler_test = process.env.NODE_ENV === 'test' ? handler : undefined;
