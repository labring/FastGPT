import { type DatasetSchemaType } from '@fastgpt/global/core/dataset/type';
import { MongoDatasetCollection } from './collection/schema';
import { MongoDataset, MongoDatasetCollectionImage } from './schema';
import { delCollectionRelatedSource } from './collection/controller';
import { type ClientSession } from '../../common/mongo';
import { MongoDatasetTraining } from './training/schema';
import { MongoDatasetData } from './data/schema';
import { deleteDatasetDataVector } from '../../common/vectorDB/controller';
import { MongoDatasetDataText } from './data/dataTextSchema';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { retryFn } from '@fastgpt/global/common/system/utils';
import { addMinutes } from 'date-fns';

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
    return Promise.reject('Dataset not found');
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
  datasets: DatasetSchemaType[];
  session: ClientSession;
}) {
  if (!datasets.length) return;

  const teamId = datasets[0].teamId;

  if (!teamId) {
    return Promise.reject('TeamId is required');
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

  await retryFn(async () => {
    await Promise.all([
      // delete training data
      MongoDatasetTraining.deleteMany({
        teamId,
        datasetId: { $in: datasetIds }
      }),
      //Delete dataset_data_texts
      MongoDatasetDataText.deleteMany({
        teamId,
        datasetId: { $in: datasetIds }
      }),
      //delete dataset_datas
      MongoDatasetData.deleteMany({ teamId, datasetId: { $in: datasetIds } }),
      // Delete Image and file
      delCollectionRelatedSource({ collections }),
      // Delete vector data
      deleteDatasetDataVector({ teamId, datasetIds }),
      // Delete dataset collection images
      MongoDatasetCollectionImage.deleteMany({
        teamId,
        datasetId: { $in: datasetIds }
      })
    ]);
  });

  // delete collections
  await MongoDatasetCollection.deleteMany({
    teamId,
    datasetId: { $in: datasetIds }
  }).session(session);
}

/* ============= dataset images ========== */

export async function createDatasetImage({
  teamId,
  datasetId,
  collectionId,
  name,
  path,
  contentType,
  size,
  metadata = {}
}: {
  teamId: string;
  datasetId: string;
  collectionId?: string;
  name: string;
  path: string;
  contentType: string;
  size: number;
  metadata?: Record<string, any>;
}): Promise<string> {
  // Set TTL to 30min
  const expiredTime = addMinutes(new Date(), 30);

  const image = await MongoDatasetCollectionImage.create({
    teamId: String(teamId),
    datasetId: String(datasetId),
    collectionId: collectionId ? String(collectionId) : null,
    name,
    path,
    contentType,
    size,
    metadata,
    createTime: new Date(),
    expiredTime
  });

  return String(image._id);
}

export async function getDatasetImage(imageId: string): Promise<any> {
  try {
    if (!imageId || imageId.length !== 24) {
      return null;
    }

    const result = await MongoDatasetCollectionImage.findById(imageId).lean();

    return result;
  } catch (error) {
    return null;
  }
}
