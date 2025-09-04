import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema';
import { Types } from '@fastgpt/service/common/mongo';
import type {
  listFailedTasksBody,
  listFailedTasksResponse
} from '@fastgpt/global/core/evaluation/dataset/api';
import { evalDatasetDataSynthesizeQueue } from '@fastgpt/service/core/evaluation/dataset/dataSynthesizeMq';
import { authEvaluationDatasetRead } from '@fastgpt/service/core/evaluation/common';

async function handler(
  req: ApiRequestProps<listFailedTasksBody, {}>
): Promise<listFailedTasksResponse> {
  const { collectionId } = req.body;

  const { teamId } = await authEvaluationDatasetRead(collectionId, {
    req,
    authApiKey: true,
    authToken: true
  });

  const collection = await MongoEvalDatasetCollection.findOne({
    _id: new Types.ObjectId(collectionId),
    teamId: new Types.ObjectId(teamId)
  });

  if (!collection) {
    throw new Error('Evaluation dataset not found or access denied');
  }

  try {
    const failedJobs = await evalDatasetDataSynthesizeQueue.getJobs(['failed']);
    const collectionFailedJobs = failedJobs.filter(
      (job) => job.data.evalDatasetCollectionId === collectionId
    );

    const tasks = await Promise.all(
      collectionFailedJobs.map(async (job) => {
        const failureReason = job.failedReason || 'Unknown error';
        return {
          jobId: job.id || '',
          dataId: job.data.dataId,
          errorMessage: failureReason,
          failedAt: job.finishedOn ? new Date(job.finishedOn) : new Date(),
          attemptsMade: job.attemptsMade,
          maxAttempts: job.opts.attempts || 3
        };
      })
    );

    return {
      tasks
    };
  } catch (error) {
    console.error('Error fetching failed tasks:', error);
    throw new Error('Error occurred while fetching failed tasks list');
  }
}

export default NextAPI(handler);

// Export handler for testing
export const handler_test = process.env.NODE_ENV === 'test' ? handler : undefined;
