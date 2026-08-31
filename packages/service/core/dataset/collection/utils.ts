import { MongoDatasetCollection } from './schema';
import type { ClientSession } from '../../../common/mongo';
import { MongoDatasetCollectionTagsV2 } from '../tag/schemaV2';
import { readFromSecondary } from '../../../common/mongo/utils';
import {
  DEFAULT_TAG,
  type CollectionTagValueType,
  type CollectionWithDatasetType,
  type DatasetCollectionTagType
} from '@fastgpt/global/core/dataset/type';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import {
  DatasetCollectionDataProcessModeEnum,
  DatasetCollectionSyncResultEnum,
  DatasetCollectionTypeEnum,
  DatasetSourceReadTypeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { readDatasetSourceRawText } from '../read';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { createCollectionAndInsertData, delCollection } from './controller';
import { collectionCanSync } from '@fastgpt/global/core/dataset/collection/utils';

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

const normalizeDatasetTagValue = ({
  tagType,
  value
}: {
  tagType: DatasetCollectionTagType;
  value: string | number | string[];
}): { value: string | number | string[]; error?: DatasetErrEnum } => {
  if (tagType !== 'number' && tagType !== 'datetime') return { value };

  const numericValue =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (typeof value === 'string' && value.trim() === '') {
    return { value, error: DatasetErrEnum.tagValueInvalid };
  }
  if (!Number.isFinite(numericValue)) return { value, error: DatasetErrEnum.tagValueInvalid };
  if (tagType === 'datetime' && Number.isNaN(new Date(numericValue).getTime())) {
    return { value, error: DatasetErrEnum.tagValueDatetimeInvalid };
  }

  return { value: numericValue };
};

export const validateDatasetTagValue = ({
  tagType,
  value
}: {
  tagType?: DatasetCollectionTagType;
  value: string | number | string[];
}): DatasetErrEnum | undefined => {
  const type = tagType || 'string';

  if (type === 'string' && (typeof value !== 'string' || value.length > 256)) {
    return DatasetErrEnum.tagValueInvalid;
  }
  if (type === 'array') {
    if (
      !Array.isArray(value) ||
      value.length > 64 ||
      value.some((item) => typeof item !== 'string' || item.length > 256)
    ) {
      return DatasetErrEnum.arrayTagValueInvalid;
    }
    return undefined;
  }

  return normalizeDatasetTagValue({ tagType: type, value }).error;
};

/**
 * 校验并规范化单个标签值，返回可直接持久化的 value。
 * - number/datetime：统一按 number 存储（字符串转 number、datetime 按 UTC 毫秒时间戳校验）
 * - string/array：仅校验，值原样返回
 * Collection 创建路径与 fastgpt-pro 标签值写路径共用，保证两条写链路存储格式一致
 */
export const validateAndNormalizeTagValue = ({
  tagType,
  value
}: {
  tagType?: DatasetCollectionTagType;
  value: string | number | string[];
}): { value: string | number | string[]; error?: DatasetErrEnum } => {
  if (tagType === 'number' || tagType === 'datetime') {
    return normalizeDatasetTagValue({ tagType, value });
  }
  return { value, error: validateDatasetTagValue({ tagType, value }) };
};

const isSameTagValue = (a: string | number | string[], b: string | number | string[]): boolean => {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    const bSet = new Set(b);
    return a.every((item) => bSet.has(item));
  }
  return a === b;
};

/**
 * 同一 tagId 去重：值相同去重，值冲突拒绝整个批量操作。
 * 所有标签值写入路径（Collection 创建/更新、Pro setCollectionTags/batchSetCollectionTags）复用此逻辑
 */
export const deduplicateTagValues = async (
  tags: CollectionTagValueType[]
): Promise<CollectionTagValueType[]> => {
  const seen = new Map<string, string | number | string[]>();
  const deduped: CollectionTagValueType[] = [];
  for (const t of tags) {
    if (seen.has(t.tagId)) {
      if (!isSameTagValue(seen.get(t.tagId)!, t.value)) {
        return Promise.reject(DatasetErrEnum.tagValueInvalid);
      }
    } else {
      seen.set(t.tagId, t.value);
      deduped.push(t);
    }
  }
  return deduped;
};

/**
 * 查找或创建 default_tag 承载记录：按 fromMigration 定位（不依赖标签名，改名后仍可复用），
 * 兼容存量按 DEFAULT_TAG 名称创建的记录；并发创建撞唯一索引时复用已存在记录
 */
async function findOrCreateDefaultTag({
  datasetId,
  teamId,
  session
}: {
  datasetId: string;
  teamId: string;
  session?: ClientSession;
}) {
  const findDefaultTag = () =>
    MongoDatasetCollectionTagsV2.findOne(
      { teamId, datasetId, $or: [{ fromMigration: true }, { tag: DEFAULT_TAG }] },
      undefined,
      { session }
    ).lean();

  const existing = await findDefaultTag();
  if (existing) return existing;

  try {
    const [created] = await MongoDatasetCollectionTagsV2.create(
      [{ teamId, datasetId, tag: DEFAULT_TAG, tagType: 'array', fromMigration: true }],
      { session }
    );
    return created.toObject ? created.toObject() : created;
  } catch (error: any) {
    if (error?.code !== 11000) throw error;
    const raced = await findDefaultTag();
    if (raced) return raced;
    throw error;
  }
}

/**
 * 统一解析 collection 创建时的 tags 入参：
 * - string 元素（旧格式标签名）→ 归并到 v2 表 default_tag array 标签
 * - {tag, value} 元素 → 查找 v2 表标签并校验值类型，返回 {tagId, value}
 *
 * 返回值可直接写入 collection.tags 字段存储。
 * 同一 tagId 多条输入：值相同去重，值冲突拒绝整个操作。
 */
export const createOrGetCollectionTags = async ({
  tags,
  datasetId,
  teamId,
  session
}: {
  tags?: (string | { tag: string; value: string | number | string[] })[];
  datasetId: string;
  teamId: string;
  session?: ClientSession;
}): Promise<CollectionTagValueType[] | undefined> => {
  if (!tags) return undefined;
  if (tags.length === 0) return [];

  const stringNames = tags.filter((item): item is string => typeof item === 'string');
  const objectInputs = tags.filter(
    (item): item is { tag: string; value: string | number | string[] } => typeof item !== 'string'
  );

  const trimmedStringNames = stringNames.map((name) => name.trim());
  if (trimmedStringNames.some((name) => !name)) return Promise.reject(DatasetErrEnum.tagNameEmpty);

  const defaultObjectInputs = objectInputs.filter((item) => item.tag.trim() === DEFAULT_TAG);
  const regularObjectInputs = objectInputs.filter((item) => item.tag.trim() !== DEFAULT_TAG);

  const regularTagNames = regularObjectInputs.map((item) => item.tag.trim());
  if (regularTagNames.some((name) => !name)) return Promise.reject(DatasetErrEnum.tagNameEmpty);

  const regularTags = regularTagNames.length
    ? await MongoDatasetCollectionTagsV2.find(
        { teamId, datasetId, tag: { $in: regularTagNames } },
        undefined,
        { session }
      ).lean()
    : [];
  const regularTagMap = new Map(regularTags.map((tag) => [tag.tag, tag]));

  const normalizedRegularInputs = regularObjectInputs.map((input) => {
    const tagDoc = regularTagMap.get(input.tag.trim());
    if (!tagDoc) {
      return { input, value: input.value, error: DatasetErrEnum.tagNotExist };
    }
    const tagType = tagDoc.tagType || 'string';
    const { value, error } = validateAndNormalizeTagValue({ tagType, value: input.value });
    return {
      tagId: String(tagDoc._id),
      value,
      error
    };
  });

  for (const { error } of normalizedRegularInputs) {
    if (error) return Promise.reject(error);
  }

  // default_tag 承载记录：string 名与 tag=default_tag 的对象值合并为单条 array 记录
  const defaultValues: string[] = [...new Set(trimmedStringNames)];
  for (const { value } of defaultObjectInputs) {
    const error = validateDatasetTagValue({ tagType: 'array', value });
    if (error) return Promise.reject(error);
    if (Array.isArray(value)) defaultValues.push(...value);
  }

  const result: CollectionTagValueType[] = [];

  if (defaultValues.length > 0) {
    const defaultTag = await findOrCreateDefaultTag({ datasetId, teamId, session });
    result.push({ tagId: String(defaultTag._id), value: [...new Set(defaultValues)] });
  }

  result.push(...normalizedRegularInputs.map(({ tagId, value }) => ({ tagId: tagId!, value })));

  return deduplicateTagValues(result);
};

/**
 * 将 collection 的 tags（混合格式）解析为可重入的输入格式
 * - 旧格式 ObjectId → 标签名（如 "safety"）
 * - 新格式 {tagId, value} → {tag: 标签名, value}（如 {tag: "safety", value: "A"}）
 *
 * 输出结果可作为 createOrGetCollectionTags 的 tags 参数，用于同步、重建等场景
 */
export const collectionTagsToTagLabel = async ({
  datasetId,
  tags
}: {
  datasetId: string;
  tags?: (string | CollectionTagValueType)[];
}): Promise<(string | { tag: string; value: string | number | string[] })[] | undefined> => {
  if (!tags) return undefined;
  if (tags.length === 0) return [];

  const collectionTags = await MongoDatasetCollectionTagsV2.find({ datasetId }, undefined, {
    ...readFromSecondary
  }).lean();
  const tagsMap = new Map<string, string>();
  collectionTags.forEach((tag) => {
    tagsMap.set(String(tag._id), tag.tag);
  });

  return tags
    .map((tag) => {
      if (typeof tag === 'string') {
        const tagName = tagsMap.get(tag);
        return tagName ?? null;
      }
      const tagName = tagsMap.get(tag.tagId);
      return tagName ? { tag: tagName, value: tag.value } : null;
    })
    .filter(
      (item): item is string | { tag: string; value: string | number | string[] } => item !== null
    );
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
          tags: await collectionTagsToTagLabel({
            datasetId: collection.datasetId,
            tags: collection.tags
          })
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
*/
export const getTrainingModeByCollection = ({
  trainingType,
  autoIndexes,
  imageIndex,
  supportImageIndex = false
}: {
  trainingType?: DatasetCollectionDataProcessModeEnum;
  autoIndexes?: boolean;
  imageIndex?: boolean;
  supportImageIndex?: boolean;
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
  if (
    trainingType === DatasetCollectionDataProcessModeEnum.chunk &&
    imageIndex &&
    supportImageIndex &&
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
