import { MongoDatasetCollection } from './schema';
import { ClientSession } from '../../../common/mongo';
import { MongoDatasetCollectionTags } from '../tag/schema';
import { readFromSecondary } from '../../../common/mongo/utils';
import { CollectionWithDatasetType } from '@fastgpt/global/core/dataset/type';
import {
  DatasetCollectionSyncResultEnum,
  DatasetCollectionTypeEnum,
  DatasetSourceReadTypeEnum,
  DatasetTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { readDatasetSourceRawText } from '../read';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { createCollectionAndInsertData, delCollection } from './controller';

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

export function getCollectionUpdateTime({ name, time }: { time?: Date; name: string }) {
  if (time) return time;
  if (name.startsWith('手动') || ['manual', 'mark'].includes(name)) return new Date('2999/9/9');
  return new Date();
}

export const createOrGetCollectionTags = async ({
  tags,
  datasetId,
  teamId,
  session
}: {
  tags?: string[];
  datasetId: string;
  teamId: string;
  session?: ClientSession;
}) => {
  if (!tags) return undefined;

  if (tags.length === 0) return [];

  const existingTags = await MongoDatasetCollectionTags.find(
    {
      teamId,
      datasetId,
      tag: { $in: tags }
    },
    undefined,
    { session }
  ).lean();

  const existingTagContents = existingTags.map((tag) => tag.tag);
  const newTagContents = tags.filter((tag) => !existingTagContents.includes(tag));

  const newTags = await MongoDatasetCollectionTags.insertMany(
    newTagContents.map((tagContent) => ({
      teamId,
      datasetId,
      tag: tagContent
    })),
    { session }
  );

  return [...existingTags.map((tag) => tag._id), ...newTags.map((tag) => tag._id)];
};

export const collectionTagsToTagLabel = async ({
  datasetId,
  tags
}: {
  datasetId: string;
  tags?: string[];
}) => {
  if (!tags) return undefined;
  if (tags.length === 0) return;

  // Get all the tags
  const collectionTags = await MongoDatasetCollectionTags.find({ datasetId }, undefined, {
    ...readFromSecondary
  }).lean();
  const tagsMap = new Map<string, string>();
  collectionTags.forEach((tag) => {
    tagsMap.set(String(tag._id), tag.tag);
  });

  return tags
    .map((tag) => {
      return tagsMap.get(tag) || '';
    })
    .filter(Boolean);
};

export const syncCollection = async (collection: CollectionWithDatasetType) => {
  const dataset = collection.datasetId;

  if (
    collection.type !== DatasetCollectionTypeEnum.link &&
    dataset.type !== DatasetTypeEnum.apiDataset
  ) {
    return Promise.reject(DatasetErrEnum.notSupportSync);
  }

  // Get new text
  const sourceReadType = await (async () => {
    if (collection.type === DatasetCollectionTypeEnum.link) {
      if (!collection.rawLink) return Promise.reject('rawLink is missing');
      return {
        type: DatasetSourceReadTypeEnum.link,
        sourceId: collection.rawLink,
        selector: collection.metadata?.webPageSelector
      };
    }

    if (!collection.apiFileId) return Promise.reject('apiFileId is missing');
    if (!dataset.apiServer) return Promise.reject('apiServer not found');
    return {
      type: DatasetSourceReadTypeEnum.apiFile,
      sourceId: collection.apiFileId,
      apiServer: dataset.apiServer
    };
  })();
  const rawText = await readDatasetSourceRawText({
    teamId: collection.teamId,
    ...sourceReadType
  });

  // Check if the original text is the same: skip if same
  const hashRawText = hashStr(rawText);
  if (collection.hashRawText && hashRawText === collection.hashRawText) {
    return DatasetCollectionSyncResultEnum.sameRaw;
  }

  await mongoSessionRun(async (session) => {
    // Create new collection
    await createCollectionAndInsertData({
      session,
      dataset,
      rawText: rawText,
      createCollectionParams: {
        teamId: collection.teamId,
        tmbId: collection.tmbId,
        datasetId: collection.datasetId._id,
        name: collection.name,
        type: collection.type,

        fileId: collection.fileId,
        rawLink: collection.rawLink,
        externalFileId: collection.externalFileId,
        externalFileUrl: collection.externalFileUrl,
        apiFileId: collection.apiFileId,

        rawTextLength: rawText.length,
        hashRawText,

        tags: collection.tags,
        createTime: collection.createTime,

        parentId: collection.parentId,
        trainingType: collection.trainingType,
        chunkSize: collection.chunkSize,
        chunkSplitter: collection.chunkSplitter,
        qaPrompt: collection.qaPrompt,
        metadata: collection.metadata
      }
    });

    // Delete old collection
    await delCollection({
      collections: [collection],
      delRelatedSource: false,
      session
    });
  });

  return DatasetCollectionSyncResultEnum.success;
};
