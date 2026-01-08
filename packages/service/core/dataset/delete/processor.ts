import type { Processor } from 'bullmq';
import { addDatasetDeleteJob, type DatasetDeleteJobData } from './index';
import { delDatasetRelevantData, findDatasetAndAllChildren } from '../controller';
import { addLog } from '../../../common/system/log';
import { MongoDatasetCollectionTags } from '../tag/schema';
import { removeDatasetSyncJobScheduler } from '../datasetSync';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { MongoDataset } from '../schema';
import { removeImageByPath } from '../../../common/file/image/controller';
import { MongoDatasetTraining } from '../training/schema';

export const deleteDatasetsImmediate = async ({
  teamId,
  datasetIds
}: {
  teamId: string;
  datasetIds: string[];
}) => {
  // delete training data
  await MongoDatasetTraining.deleteMany({
    teamId,
    datasetId: { $in: datasetIds }
  });

  // Remove cron job
  await Promise.all(
    datasetIds.map((id) => {
      return removeDatasetSyncJobScheduler(id);
    })
  );
};
// Clear a team datasets
export const deleteTeamAllDatasets = async (teamId: string) => {
  const datasets = await MongoDataset.find(
    {
      teamId
    },
    { _id: 1, parentId: 1 }
  );
  await deleteDatasetsImmediate({
    teamId,
    datasetIds: datasets.map((d) => d._id)
  });
  await Promise.all(
    datasets.map((dataset) => {
      if (dataset.parentId) return;
      return addDatasetDeleteJob({
        teamId,
        datasetId: dataset._id
      });
    })
  );
};

// 批量删除函数
const deleteDatasets = async ({
  teamId,
  datasets
}: {
  teamId: string;
  datasets: { _id: string; avatar: string; teamId: string }[];
}) => {
  const datasetIds = datasets.map((d) => d._id);

  // delete collection.tags
  await MongoDatasetCollectionTags.deleteMany({
    teamId,
    datasetId: { $in: datasetIds }
  });

  // Delete dataset avatar
  for await (const dataset of datasets) {
    await removeImageByPath(dataset.avatar);
  }

  // delete all dataset.data and pg data
  await mongoSessionRun(async (session) => {
    // delete dataset data
    await delDatasetRelevantData({
      datasets,
      session
    });
  });

  // delete dataset
  await MongoDataset.deleteMany({
    _id: { $in: datasetIds }
  });
};

export const datasetDeleteProcessor: Processor<DatasetDeleteJobData> = async (job) => {
  const { teamId, datasetId } = job.data;
  const startTime = Date.now();

  addLog.info(`[Dataset Delete] Start deleting dataset: ${datasetId} for team: ${teamId}`);

  try {
    // 1. 查找知识库及其所有子知识库
    const datasets = await findDatasetAndAllChildren({
      teamId,
      datasetId,
      fields: '_id teamId avatar'
    });

    if (!datasets || datasets.length === 0) {
      addLog.warn(`[Dataset Delete] Dataset not found: ${datasetId}`);
      return;
    }

    // 2. 安全检查：确保所有要删除的数据集都已标记为 deleteTime
    const markedForDelete = await MongoDataset.find(
      {
        _id: { $in: datasets.map((d) => d._id) },
        teamId,
        deleteTime: { $ne: null }
      },
      { _id: 1 }
    ).lean();

    if (markedForDelete.length !== datasets.length) {
      addLog.warn(
        `[Dataset Delete] Safety check: ${markedForDelete.length}/${datasets.length} datasets marked for deletion`,
        {
          markedDatasetIds: markedForDelete.map((d) => d._id),
          totalDatasetIds: datasets.map((d) => d._id)
        }
      );
    }

    // 3. 执行真正的删除操作（只删除已经标记为 deleteTime 的数据）
    await deleteDatasets({
      teamId,
      datasets
    });

    addLog.info(
      `[Dataset Delete] Successfully deleted dataset: ${datasetId} and ${datasets.length - 1} children`,
      {
        duration: Date.now() - startTime,
        totalDatasets: datasets.length,
        datasetIds: datasets.map((d) => d._id)
      }
    );
  } catch (error: any) {
    addLog.error(`[Dataset Delete] Failed to delete dataset: ${datasetId}`, error);
    throw error;
  }
};
