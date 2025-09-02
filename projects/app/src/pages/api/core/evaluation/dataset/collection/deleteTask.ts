import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema';
import { Types } from '@fastgpt/service/common/mongo';
import type { deleteTaskBody } from '@fastgpt/global/core/evaluation/dataset/api';
import { evalDatasetDataSynthesizeQueue } from '@fastgpt/service/core/evaluation/dataset/dataSynthesizeMq';
import { addLog } from '@fastgpt/service/common/system/log';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

async function handler(
  req: ApiRequestProps<deleteTaskBody, {}>
): Promise<{ success: boolean; message: string }> {
  const { teamId, tmbId } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true,
    per: WritePermissionVal
  });

  const { collectionId, jobId } = req.body;

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
        message: 'Only failed tasks can be deleted'
      };
    }

    await job.remove();

    addLog.info('Task deleted successfully', {
      jobId,
      collectionId,
      teamId
    });

    (async () => {
      addAuditLog({
        tmbId,
        teamId,
        event: AuditEventEnum.DELETE_EVALUATION_DATASET_TASK,
        params: {
          collectionName: collection.name
        }
      });
    })();

    return {
      success: true,
      message: 'Task deleted successfully'
    };
  } catch (error) {
    console.error('Error deleting task:', error);
    addLog.error('Failed to delete task', {
      jobId,
      collectionId,
      teamId,
      error
    });

    return {
      success: false,
      message: 'Failed to delete task'
    };
  }
}

export default NextAPI(handler);

// Export handler for testing
export const handler_test = process.env.NODE_ENV === 'test' ? handler : undefined;
