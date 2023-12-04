import type { CollectionWithDatasetType } from '@fastgpt/global/core/dataset/type.d';
import { MongoDatasetCollection } from './schema';
import type { ParentTreePathItemType } from '@fastgpt/global/common/parentFolder/type.d';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constant';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { urlsFetch } from '@fastgpt/global/common/file/tools';
import { splitText2Chunks } from '@fastgpt/global/common/string/textSplitter';
import { createTrainingBill } from '../../../support/wallet/bill/controller';
import { BillSourceEnum } from '@fastgpt/global/support/wallet/bill/constants';
import { MongoDatasetTraining } from '../training/schema';

/**
 * get all collection by top collectionId
 */
export async function findCollectionAndChild(id: string, fields = '_id parentId name metadata') {
  async function find(id: string) {
    // find children
    const children = await MongoDatasetCollection.find({ parentId: id }, fields);

    let collections = children;

    for (const child of children) {
      const grandChildrenIds = await find(child._id);
      collections = collections.concat(grandChildrenIds);
    }

    return collections;
  }
  const [collection, childCollections] = await Promise.all([
    MongoDatasetCollection.findById(id, fields),
    find(id)
  ]);

  if (!collection) {
    return Promise.reject('Collection not found');
  }

  return [collection, ...childCollections];
}

export async function getDatasetCollectionPaths({
  parentId = ''
}: {
  parentId?: string;
}): Promise<ParentTreePathItemType[]> {
  async function find(parentId?: string): Promise<ParentTreePathItemType[]> {
    if (!parentId) {
      return [];
    }

    const parent = await MongoDatasetCollection.findOne({ _id: parentId }, 'name parentId');

    if (!parent) return [];

    const paths = await find(parent.parentId);
    paths.push({ parentId, parentName: parent.name });

    return paths;
  }

  return await find(parentId);
}

export function getCollectionUpdateTime({ name, time }: { time?: Date; name: string }) {
  if (time) return time;
  if (name.startsWith('手动') || ['manual', 'mark'].includes(name)) return new Date('2999/9/9');
  return new Date();
}

/* link collection start load data */
export const loadingOneLinkCollection = async ({
  collectionId,
  tmbId
}: {
  collectionId: string;
  tmbId: string;
}) => {
  const collection = (await MongoDatasetCollection.findById(collectionId).populate(
    'datasetId'
  )) as CollectionWithDatasetType;

  if (!collection) {
    return Promise.reject(DatasetErrEnum.unCreateCollection);
  }

  if (collection.type !== DatasetCollectionTypeEnum.link || !collection.rawLink) {
    throw new Error(DatasetErrEnum.unLinkCollection);
  }

  // crawl new data
  const result = await urlsFetch({
    urlList: [collection.rawLink],
    selector: collection.datasetId?.websiteConfig?.selector
  });
  const rawText = result[0]?.content;

  if (!rawText) {
    throw new Error('Can not fetch the link data');
  }

  // split data
  const { chunks } = splitText2Chunks({
    text: rawText,
    chunkLen: collection.chunkSize || 512
  });

  // create training bill
  const { billId } = await createTrainingBill({
    teamId: collection.teamId,
    tmbId,
    appName: collection.name,
    billSource: BillSourceEnum.training,
    vectorModel: collection.datasetId.vectorModel,
    agentModel: collection.datasetId.agentModel
  });

  // insert to training queue
  await MongoDatasetTraining.insertMany(
    chunks.map((item, i) => ({
      teamId: collection.teamId,
      tmbId,
      datasetId: collection.datasetId._id,
      collectionId: collection._id,
      billId,
      mode: collection.trainingType,
      prompt: '',
      model: collection.datasetId.vectorModel,
      q: item,
      a: '',
      chunkIndex: i
    }))
  );
};
