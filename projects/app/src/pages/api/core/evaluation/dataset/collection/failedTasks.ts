import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { Types } from '@fastgpt/service/common/mongo';
import type {
  listFailedTasksBody,
  listFailedTasksResponse
} from '@fastgpt/global/core/evaluation/dataset/api';
import { evalDatasetDataSynthesizeQueue } from '@fastgpt/service/core/evaluation/dataset/dataSynthesizeMq';
import { authEvaluationDatasetRead } from '@fastgpt/service/core/evaluation/common';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';
import { addLog } from '@fastgpt/service/common/system/log';
import { authDatasetByTmbId } from '@fastgpt/service/support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';

async function handler(
  req: ApiRequestProps<listFailedTasksBody, {}>
): Promise<listFailedTasksResponse> {
  const { collectionId } = req.body;

  const { teamId, tmbId } = await authEvaluationDatasetRead(collectionId, {
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
    const collectionDataMap = new Map();
    if (dataIds.length > 0) {
      const datasetDatas = await MongoDatasetData.find(
        { _id: { $in: dataIds } },
        '_id datasetId collectionId'
      ).lean();

      datasetDatas.forEach((data) => {
        datasetDataMap.set(String(data._id), String(data.datasetId));
        collectionDataMap.set(String(data._id), String(data.collectionId));
      });
    }

    const datasetNameMap = new Map();
    const uniqueDatasetIds = [...new Set(Array.from(datasetDataMap.values()))];
    if (uniqueDatasetIds.length > 0) {
      await Promise.all(
        uniqueDatasetIds.map(async (datasetId) => {
          await authDatasetByTmbId({
            tmbId,
            datasetId,
            per: ReadPermissionVal
          });
        })
      );
      const datasets = await MongoDataset.find(
        { _id: { $in: uniqueDatasetIds } },
        '_id name'
      ).lean();

      datasets.forEach((dataset) => {
        datasetNameMap.set(String(dataset._id), dataset.name);
      });
    }

    const collectionNameMap = new Map();
    const uniqueCollectionIds = [...new Set(Array.from(collectionDataMap.values()))];
    if (uniqueCollectionIds.length > 0) {
      const collections = await MongoDatasetCollection.find(
        { _id: { $in: uniqueCollectionIds } },
        '_id name'
      ).lean();

      collections.forEach((collection) => {
        collectionNameMap.set(String(collection._id), collection.name);
      });
    }

    const tasks = await Promise.all(
      collectionFailedJobs.map(async (job) => {
        const failureReason = job.failedReason || 'Unknown error';
        const datasetId = datasetDataMap.get(job.data.dataId) || '';
        const datasetName = datasetNameMap.get(datasetId) || '';
        const collectionId = collectionDataMap.get(job.data.dataId) || '';
        const collectionName = collectionNameMap.get(collectionId) || '';

        return {
          jobId: job.id || '',
          dataId: job.data.dataId,
          datasetId: datasetId,
          datasetName: datasetName,
          collectionId: collectionId,
          collectionName: collectionName,
          errorMessage: failureReason,
          failedAt: job.finishedOn ? new Date(job.finishedOn) : new Date(),
          attemptsMade: job.attemptsMade,
          maxAttempts: job.opts.attempts || 3,
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
