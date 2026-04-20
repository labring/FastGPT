import { MongoDatasetCollection } from './schema';
import type { ClientSession } from '../../../common/mongo';
import { Types } from '../../../common/mongo';
import { MongoDatasetCollectionTags } from '../tag/schema';
import { readFromSecondary } from '../../../common/mongo/utils';
import type {
  CollectionTagValueType,
  CollectionWithDatasetType
} from '@fastgpt/global/core/dataset/type';
import { DatasetCollectionSchemaType } from '@fastgpt/global/core/dataset/type';
import {
  DatasetCollectionDataProcessModeEnum,
  DatasetCollectionSyncResultEnum,
  DatasetCollectionTypeEnum,
  DatasetSourceReadTypeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { readDatasetSourceRawText } from '../read';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { createCollectionAndInsertData, delCollection } from './controller';
import { collectionCanSync } from '@fastgpt/global/core/dataset/collection/utils';

// 更新父 folder 的 updateTime
export async function updateParentFolderTime(parentId: string | null) {
  if (!parentId) return;

  // 使用 MongoDB 的 $currentDate 操作符，由中间件自动处理 updateTime
  // 这样可以避免与 Mongoose 中间件冲突，且更高效
  await MongoDatasetCollection.updateOne(
    { _id: new Types.ObjectId(parentId) },
    { $currentDate: { updateTime: true } }
  );
}

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
      { teamId, datasetId, parentId: id, deleteTime: null },
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
  tags?: (string | CollectionTagValueType)[];
  datasetId: string;
  teamId: string;
  session?: ClientSession;
}) => {
  if (!tags) return undefined;
  if (tags.length === 0) return [];

  // 分离旧格式（string 内容）和新格式（key-value）
  const stringContents = tags.filter((t): t is string => typeof t === 'string');
  const kvItems = tags.filter(
    (t): t is CollectionTagValueType => typeof t === 'object' && t !== null
  );

  // 合并所有需要查找/创建的 tag 内容
  const allTagContents = [
    ...stringContents,
    ...kvItems.map((t) => t.tagId) // 输入时 tagId 为 tag 内容值
  ];

  if (allTagContents.length === 0) return [];

  const existingTags = await MongoDatasetCollectionTags.find(
    { teamId, datasetId, tag: { $in: allTagContents } },
    undefined,
    { session }
  ).lean();

  const existingTagMap = new Map(existingTags.map((t) => [t.tag, t._id]));

  const newTagContents = allTagContents.filter((content) => !existingTagMap.has(content));
  if (newTagContents.length > 0) {
    const newTags = await MongoDatasetCollectionTags.insertMany(
      newTagContents.map((tagContent) => ({ teamId, datasetId, tag: tagContent })),
      { session, ordered: true }
    );
    newTags.forEach((t) => existingTagMap.set(t.tag, t._id));
  }

  // 旧格式返回 ObjectId，新格式返回 { tagId: resolvedId, value }
  const resolvedStringIds = stringContents.map((content) => existingTagMap.get(content)!);
  const resolvedKvItems: CollectionTagValueType[] = kvItems.map((t) => ({
    tagId: String(existingTagMap.get(t.tagId)!),
    value: t.value
  }));

  return [...resolvedStringIds, ...resolvedKvItems];
};

/**
 * 将集合的标签 ID/对象列表转换为可展示的标签标识列表。
 *
 * - 旧格式（字符串 ObjectId）：查询数据库，将 ID 映射为对应的标签名称字符串。
 * - 新格式（CollectionTagValueType 对象）：直接透传，无需查询。
 *
 * @param datasetId - 所属知识库 ID，用于查询旧格式标签
 * @param tags - 待转换的标签列表（可为 undefined）
 * @returns 转换后的标签列表；若入参为空或结果为空则返回 undefined
 */
export const collectionTagsToTagLabel = async ({
  datasetId,
  tags
}: {
  datasetId: string;
  tags?: (string | CollectionTagValueType)[];
}): Promise<(string | CollectionTagValueType)[] | undefined> => {
  if (!tags) return undefined;
  if (tags.length === 0) return;

  // 分离新旧格式
  const oldFormatIds = tags.filter((t): t is string => typeof t === 'string');
  const newFormatItems = tags.filter(
    (t): t is CollectionTagValueType => typeof t === 'object' && t !== null
  );

  // 旧格式：ObjectId → 标签名
  let oldFormatLabels: string[] = [];
  if (oldFormatIds.length > 0) {
    const collectionTags = await MongoDatasetCollectionTags.find({ datasetId }, undefined, {
      ...readFromSecondary
    }).lean();
    const tagsMap = new Map<string, string>();
    collectionTags.forEach((tag) => {
      tagsMap.set(String(tag._id), tag.tag);
    });
    oldFormatLabels = oldFormatIds.map((tag) => tagsMap.get(tag) || '').filter(Boolean);
  }

  // 新格式：直接返回
  const result: (string | CollectionTagValueType)[] = [...oldFormatLabels, ...newFormatItems];
  return result.length > 0 ? result : undefined;
};

export const syncCollection = async (collection: CollectionWithDatasetType) => {
  const dataset = collection.dataset;

  if (!collectionCanSync(collection.type)) {
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

    const sourceId = collection.apiFileId;

    if (!sourceId) return Promise.reject('apiFileId is missing');

    return {
      type: DatasetSourceReadTypeEnum.apiFile,
      sourceId,
      apiDatasetServer: dataset.apiDatasetServer
    };
  })();

  const { title, rawText } = await readDatasetSourceRawText({
    teamId: collection.teamId,
    tmbId: collection.tmbId,
    datasetId: collection.datasetId,
    customPdfParse: collection.customPdfParse,
    ...sourceReadType
  });

  if (!rawText) {
    return DatasetCollectionSyncResultEnum.failed;
  }

  // Check if the original text is the same: skip if same
  const hashRawText = hashStr(rawText);
  if (collection.hashRawText && hashRawText !== collection.hashRawText) {
    await mongoSessionRun(async (session) => {
      // Delete old collection
      await delCollection({
        collections: [collection],
        delImg: false,
        delFile: false,
        session
      });

      // Create new collection
      await createCollectionAndInsertData({
        session,
        dataset,
        rawText: rawText,
        createCollectionParams: {
          ...collection,
          name: title || collection.name,
          updateTime: new Date(),
          tags: (await collectionTagsToTagLabel({
            datasetId: collection.datasetId,
            tags: collection.tags
          })) as string[] | undefined
        }
      });
    });

    return DatasetCollectionSyncResultEnum.success;
  } else if (title && collection.name !== title) {
    await MongoDatasetCollection.updateOne({ _id: collection._id }, { $set: { name: title } });
    return DatasetCollectionSyncResultEnum.success;
  }
  return DatasetCollectionSyncResultEnum.sameRaw;
};

/*
  QA: 独立进程
  Chunk: Image Index -> Auto index -> chunk index
  Template: Small2Big -> Auto -> chunk
*/
export const getTrainingModeByCollection = ({
  trainingType,
  autoIndexes,
  imageIndex,
  small2bigIndexes
}: {
  trainingType?: DatasetCollectionDataProcessModeEnum;
  autoIndexes?: boolean;
  imageIndex?: boolean;
  small2bigIndexes?: boolean;
}) => {
  if (
    trainingType === DatasetCollectionDataProcessModeEnum.imageParse &&
    global.feConfigs?.isPlus
  ) {
    return TrainingModeEnum.imageParse;
  }

  if (trainingType === DatasetCollectionDataProcessModeEnum.qa) {
    return TrainingModeEnum.qa;
  }
  if (trainingType === DatasetCollectionDataProcessModeEnum.databaseSchema) {
    return TrainingModeEnum.databaseSchema;
  }

  // Template: small2big -> auto -> chunk
  if (trainingType === DatasetCollectionDataProcessModeEnum.template) {
    if (small2bigIndexes) {
      return TrainingModeEnum.small2Big;
    }
    if (autoIndexes && global.feConfigs?.isPlus) {
      return TrainingModeEnum.auto;
    }

    return TrainingModeEnum.chunk;
  }

  // Chunk 模式的处理链：image -> auto -> chunk
  if (
    trainingType === DatasetCollectionDataProcessModeEnum.chunk &&
    imageIndex &&
    global.feConfigs?.isPlus
  ) {
    return TrainingModeEnum.image;
  }
  if (
    trainingType === DatasetCollectionDataProcessModeEnum.chunk &&
    autoIndexes &&
    global.feConfigs?.isPlus
  ) {
    return TrainingModeEnum.auto;
  }
  return TrainingModeEnum.chunk;
};
