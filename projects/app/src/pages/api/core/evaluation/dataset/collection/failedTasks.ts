import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { Types } from '@fastgpt/service/common/mongo';
import type {
  listFailedTasksBody,
  listFailedTasksResponse
} from '@fastgpt/global/core/evaluation/dataset/api';
import { evalDatasetDataSynthesizeQueue } from '@fastgpt/service/core/evaluation/dataset/dataSynthesizeMq';
import { authEvaluationDatasetRead } from '@fastgpt/service/core/evaluation/common';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';
import { addLog } from '@fastgpt/service/common/system/log';

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
    return Promise.reject(EvaluationErrEnum.datasetCollectionNotFound);
  }

  try {
    const failedJobs = await evalDatasetDataSynthesizeQueue.getJobs(['failed']);
    const collectionFailedJobs = failedJobs.filter(
      (job) => job.data.evalDatasetCollectionId === collectionId
    );

    const dataIds = collectionFailedJobs.map((job) => job.data.dataId).filter(Boolean);

    const datasetDataMap = new Map();
    if (dataIds.length > 0) {
      const datasetDatas = await MongoDatasetData.find(
        { _id: { $in: dataIds } },
        '_id datasetId'
      ).lean();

      datasetDatas.forEach((data) => {
        datasetDataMap.set(String(data._id), String(data.datasetId));
      });
    }

    const tasks = await Promise.all(
      collectionFailedJobs.map(async (job) => {
        const failureReason = job.failedReason || 'Unknown error';
        const datasetId = datasetDataMap.get(job.data.dataId) || '';

        return {
          jobId: job.id || '',
          dataId: job.data.dataId,
          datasetId: datasetId,
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
    addLog.error('Fetch failed tasks list error', error);
    return Promise.reject(EvaluationErrEnum.fetchFailedTasksError);
  }
}

export default NextAPI(handler);

// Export handler for testing
export const handler_test = process.env.NODE_ENV === 'test' ? handler : undefined;
