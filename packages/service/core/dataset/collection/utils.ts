import type { CollectionWithDatasetType } from '@fastgpt/global/core/dataset/type.d';
import { MongoDatasetCollection } from './schema';
import type { ParentTreePathItemType } from '@fastgpt/global/common/parentFolder/type.d';
import { splitText2Chunks } from '@fastgpt/global/common/string/textSplitter';
import { MongoDatasetTraining } from '../training/schema';
import { urlsFetch } from '../../../common/string/cheerio';
import {
  DatasetCollectionTypeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { ClientSession } from '../../../common/mongo';

/**
 * get all collection by top collectionId
 */
export async function findCollectionAndChild({
  teamId,
  datasetId,
  collectionId,
  fields = '_id parentId name metadata'
}: {
  teamId: string;
  datasetId: string;
  collectionId: string;
  fields?: string;
}) {
  async function find(id: string) {
    // find children
    const children = await MongoDatasetCollection.find(
      { teamId, datasetId, parentId: id },
      fields
    ).lean();

    let collections = children;

    for (const child of children) {
      const grandChildrenIds = await find(child._id);
      collections = collections.concat(grandChildrenIds);
    }

    return collections;
  }
  const [collection, childCollections] = await Promise.all([
    MongoDatasetCollection.findById(collectionId, fields).lean(),
    find(collectionId)
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

/**
 * Get collection raw text by Collection or collectionId
 */
export const getCollectionAndRawText = async ({
  collectionId,
  collection,
  newRawText
}: {
  collectionId?: string;
  collection?: CollectionWithDatasetType;
  newRawText?: string;
}) => {
  const col = await (async () => {
    if (collection) return collection;
    if (collectionId) {
      return (await MongoDatasetCollection.findById(collectionId).populate(
        'datasetId'
      )) as CollectionWithDatasetType;
    }

    return null;
  })();

  if (!col) {
    return Promise.reject('Collection not found');
  }

  const { title, rawText } = await (async () => {
    if (newRawText)
      return {
        title: '',
        rawText: newRawText
      };
    // link
    if (col.type === DatasetCollectionTypeEnum.link && col.rawLink) {
      // crawl new data
      const result = await urlsFetch({
        urlList: [col.rawLink],
        selector: col.datasetId?.websiteConfig?.selector || col?.metadata?.webPageSelector
      });

      return {
        title: result[0]?.title,
        rawText: result[0]?.content
      };
    }

    // file

    return {
      title: '',
      rawText: ''
    };
  })();

  const hashRawText = hashStr(rawText);
  const isSameRawText = rawText && col.hashRawText === hashRawText;

  return {
    collection: col,
    title,
    rawText,
    isSameRawText
  };
};

/* link collection start load data */
export const reloadCollectionChunks = async ({
  collection,
  tmbId,
  billId,
  rawText,
  session
}: {
  collection: CollectionWithDatasetType;
  tmbId: string;
  billId?: string;
  rawText?: string;
  session: ClientSession;
}) => {
  const {
    title,
    rawText: newRawText,
    collection: col,
    isSameRawText
  } = await getCollectionAndRawText({
    collection,
    newRawText: rawText
  });

  if (isSameRawText) return;

  // split data
  const { chunks } = splitText2Chunks({
    text: newRawText,
    chunkLen: col.chunkSize || 512
  });

  // insert to training queue
  const model = await (() => {
    if (col.trainingType === TrainingModeEnum.chunk) return col.datasetId.vectorModel;
    if (col.trainingType === TrainingModeEnum.qa) return col.datasetId.agentModel;
    return Promise.reject('Training model error');
  })();

  await MongoDatasetTraining.insertMany(
    chunks.map((item, i) => ({
      teamId: col.teamId,
      tmbId,
      datasetId: col.datasetId._id,
      collectionId: col._id,
      billId,
      mode: col.trainingType,
      prompt: '',
      model,
      q: item,
      a: '',
      chunkIndex: i
    })),
    { session }
  );

  // update raw text
  await MongoDatasetCollection.findByIdAndUpdate(
    col._id,
    {
      ...(title && { name: title }),
      rawTextLength: newRawText.length,
      hashRawText: hashStr(newRawText)
    },
    { session }
  );
};
