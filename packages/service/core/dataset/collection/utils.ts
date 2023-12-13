import type { CollectionWithDatasetType } from '@fastgpt/global/core/dataset/type.d';
import { MongoDatasetCollection } from './schema';
import type { ParentTreePathItemType } from '@fastgpt/global/common/parentFolder/type.d';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { splitText2Chunks } from '@fastgpt/global/common/string/textSplitter';
import { MongoDatasetTraining } from '../training/schema';
import { urlsFetch } from '@fastgpt/global/common/file/tools';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constant';

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
export const loadingOneChunkCollection = async ({
  collectionId,
  tmbId,
  billId,
  rawText
}: {
  collectionId: string;
  tmbId: string;
  billId?: string;
  rawText?: string;
}) => {
  const collection = (await MongoDatasetCollection.findById(collectionId).populate(
    'datasetId'
  )) as CollectionWithDatasetType;

  if (!collection) {
    return Promise.reject(DatasetErrEnum.unCreateCollection);
  }

  const newRawText = await (async () => {
    if (rawText) return rawText;
    // link
    if (collection.type === DatasetCollectionTypeEnum.link && collection.rawLink) {
      // crawl new data
      const result = await urlsFetch({
        urlList: [collection.rawLink],
        selector: collection.datasetId?.websiteConfig?.selector
      });

      return result[0].content;
    }
    // file

    return '';
  })();

  // split data
  const { chunks } = splitText2Chunks({
    text: newRawText,
    chunkLen: collection.chunkSize || 512
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
