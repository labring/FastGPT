import { type DatasetSchemaType } from '@fastgpt/global/core/dataset/type';
import { MongoDatasetCollection } from './collection/schema';
import { MongoDataset } from './schema';
import { delCollectionRelatedSource } from './collection/controller';
import { type ClientSession } from '../../common/mongo';
import { MongoDatasetTraining } from './training/schema';
import { MongoDatasetData } from './data/schema';
import { deleteDatasetDataVector } from '../../common/vectorDB/controller';
import { MongoDatasetDataText } from './data/dataTextSchema';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { retryFn } from '@fastgpt/global/common/system/utils';
import { UserError } from '@fastgpt/global/common/error/utils';
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
  const find = async (id: string) => {
    const children = await MongoDataset.find(
      {
        teamId,
        parentId: id
      },
      fields
    ).lean();

    let datasets = children;

    for (const child of children) {
      const grandChildrenIds = await find(child._id);
      datasets = datasets.concat(grandChildrenIds);
    }

    return datasets;
  };
  const [dataset, childDatasets] = await Promise.all([
    MongoDataset.findById(datasetId).lean(),
    find(datasetId)
  ]);

  if (!dataset) {
    return Promise.reject(new UserError('Dataset not found'));
  }

  return [dataset, ...childDatasets];
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
  await deleteDatasetDataVector({ teamId, datasetIds });

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
