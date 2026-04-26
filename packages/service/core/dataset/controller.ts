import { type DatasetSchemaType } from '@fastgpt/global/core/dataset/type';
import { MongoDatasetCollection } from './collection/schema';
import { MongoDataset } from './schema';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { delCollectionRelatedSource } from './collection/controller';
import { type ClientSession } from '../../common/mongo';
import { MongoDatasetTraining } from './training/schema';
import { MongoDatasetData } from './data/schema';
import { deleteDatasetDataVector } from '../../common/vectorDB/controller';
import { MongoDatasetDataText } from './data/dataTextSchema';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { UserError } from '@fastgpt/global/common/error/utils';
import {
  DBDatasetVectorTableName,
  DBDatasetValueVectorTableName,
  DatasetVectorTableName
} from '../../common/vectorDB/constants';
import { getS3DatasetSource } from '../../common/s3/sources/dataset';

/* ============= dataset ========== */
/* find all datasetId by top datasetId */
export async function findDatasetAndAllChildren({
  teamId,
  datasetId,
  fields
}: {
  teamId: string;
  datasetId: string;
  fields?: string;
}): Promise<DatasetSchemaType[]> {
  const rootDataset = await MongoDataset.findById(datasetId, fields).lean();
  if (!rootDataset) {
    return Promise.reject(new UserError('Dataset not found'));
  }

  const allDatasets: DatasetSchemaType[] = [rootDataset as DatasetSchemaType];
  let currentQueue = [datasetId];

  // BFS：每层一次批量查询，复杂度从 O(N) 降为 O(depth)
  while (currentQueue.length > 0) {
    const children = await MongoDataset.find(
      { teamId, parentId: { $in: currentQueue } },
      fields
    ).lean();
    allDatasets.push(...(children as DatasetSchemaType[]));
    currentQueue = children.map((c) => String(c._id));
  }

  return allDatasets;
}

/**
 * Expand folder-type dataset IDs to their non-folder descendant IDs.
 * Non-folder IDs are kept as-is. Duplicates are removed.
 * BFS 批量查询：每层一次数据库查询，复杂度 O(depth)。
 */
export async function expandFolderDatasetIds(
  teamId: string,
  datasetIds: string[]
): Promise<string[]> {
  const inputDatasets = await MongoDataset.find(
    { _id: { $in: datasetIds }, teamId },
    '_id type'
  ).lean();

  const nonFolderIds: string[] = [];
  let folderQueue: string[] = [];

  for (const dataset of inputDatasets) {
    if (dataset.type === DatasetTypeEnum.folder) {
      folderQueue.push(String(dataset._id));
    } else {
      nonFolderIds.push(String(dataset._id));
    }
  }

  // BFS：每层对所有 folder 子节点批量查询一次
  while (folderQueue.length > 0) {
    const children = await MongoDataset.find(
      { parentId: { $in: folderQueue }, teamId },
      '_id type'
    ).lean();

    folderQueue = [];

    for (const child of children) {
      if (child.type === DatasetTypeEnum.folder) {
        folderQueue.push(String(child._id));
      } else {
        nonFolderIds.push(String(child._id));
      }
    }
  }

  return [...new Set(nonFolderIds)];
}

export async function getCollectionWithDataset(collectionId: string) {
  const data = await MongoDatasetCollection.findById(collectionId)
    .populate<{ dataset: DatasetSchemaType }>('dataset')
    .lean();
  if (!data) {
    return Promise.reject(DatasetErrEnum.unExistCollection);
  }
  return data;
}

/* delete all data by datasetIds */
export async function delDatasetRelevantData({
  datasets,
  session
}: {
  datasets: { _id: string; teamId: string }[];
  session: ClientSession;
}) {
  if (!datasets.length) return;

  const teamId = datasets[0].teamId;

  if (!teamId) {
    return Promise.reject(new UserError('TeamId is required'));
  }

  const datasetIds = datasets.map((item) => item._id);

  // Get _id, teamId, fileId, metadata.relatedImgId for all collections
  const collections = await MongoDatasetCollection.find(
    {
      teamId,
      datasetId: { $in: datasetIds }
    },
    '_id teamId datasetId fileId metadata'
  ).lean();

  // delete training data
  await MongoDatasetTraining.deleteMany({
    teamId,
    datasetId: { $in: datasetIds }
  });

  // Delete dataset_data_texts in batches by datasetId
  for (const datasetId of datasetIds) {
    await MongoDatasetDataText.deleteMany({
      teamId,
      datasetId
    }).maxTimeMS(300000); // Reduce timeout for single batch
  }
  // Delete dataset_datas in batches by datasetId
  for (const datasetId of datasetIds) {
    await MongoDatasetData.deleteMany({
      teamId,
      datasetId
    }).maxTimeMS(300000);
  }

  await delCollectionRelatedSource({ collections });
  // Delete vector data
  deleteDatasetDataVector({ teamId, datasetIds, tableName: DBDatasetVectorTableName }),
    deleteDatasetDataVector({ teamId, datasetIds, tableName: DBDatasetValueVectorTableName }),
    deleteDatasetDataVector({ teamId, datasetIds, tableName: DatasetVectorTableName });

  // delete collections
  await MongoDatasetCollection.deleteMany({
    teamId,
    datasetId: { $in: datasetIds }
  }).session(session);

  // Delete all dataset files
  for (const datasetId of datasetIds) {
    await getS3DatasetSource().deleteDatasetFilesByPrefix({ datasetId });
  }
}
