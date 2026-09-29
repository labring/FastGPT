import { MongoDatasetCollection } from '../schema';
import type { DatasetCollectionSchemaType } from '@fastgpt/global/core/dataset/type';
import { MongoDatasetData } from '../../data/schema';
import { MongoDatasetTraining } from '../../training/schema';

export type DatasetArchiveCollection = {
  collectionId: string;
  parentId: string | null;
  name: string;
  type: string;
  fileId?: string;
};

export type DatasetArchiveImageFile = {
  dataId: string;
  collectionId: string;
  imageId: string;
};

const archiveCollectionFields = '_id parentId name type fileId';
const archiveCollectionPermissionFields = '_id datasetId tmbId parentId inheritPermission type';

export type DatasetArchiveCollectionPermissionItem = Pick<
  DatasetCollectionSchemaType,
  '_id' | 'datasetId' | 'tmbId' | 'parentId' | 'inheritPermission' | 'type'
>;

const normalizeArchiveCollection = (collection: {
  _id: unknown;
  parentId?: unknown;
  name: string;
  type: string;
  fileId?: string;
}): DatasetArchiveCollection => ({
  collectionId: String(collection._id),
  parentId: collection.parentId ? String(collection.parentId) : null,
  name: collection.name,
  type: collection.type,
  fileId: collection.fileId
});

/** 按可信团队和知识库边界批量读取指定 Collection。 */
export const findArchiveCollectionsByIds = async ({
  teamId,
  datasetId,
  collectionIds
}: {
  teamId: string;
  datasetId: string;
  collectionIds: string[];
}) => {
  const collections = await MongoDatasetCollection.find(
    { teamId, datasetId, _id: { $in: collectionIds } },
    archiveCollectionFields
  ).lean();

  return collections.map(normalizeArchiveCollection);
};

/**
 * 按可信团队和知识库边界流式读取一层子 Collection。
 * MongoDB cursor 使用固定批次拉取，调用方提前退出迭代时也会关闭服务端游标。
 */
export async function* iterateArchiveCollectionsByParentIds({
  teamId,
  datasetId,
  parentIds
}: {
  teamId: string;
  datasetId: string;
  parentIds: string[];
}) {
  const cursor = MongoDatasetCollection.find(
    { teamId, datasetId, parentId: { $in: parentIds } },
    archiveCollectionFields
  )
    .lean()
    .cursor({ batchSize: 500 });

  try {
    for await (const collection of cursor) {
      yield normalizeArchiveCollection(collection);
    }
  } finally {
    await cursor.close().catch(() => undefined);
  }
}

/** 按可信团队和知识库边界分批读取图片集合中的原始图片 key。 */
export async function* iterateArchiveImageFilesByCollectionIds({
  teamId,
  datasetId,
  collectionIds
}: {
  teamId: string;
  datasetId: string;
  collectionIds: string[];
}): AsyncGenerator<DatasetArchiveImageFile> {
  if (collectionIds.length === 0) return;

  const filter = {
    teamId,
    datasetId,
    collectionId: { $in: collectionIds },
    imageId: { $type: 'string', $ne: '' }
  };
  const fields = '_id collectionId imageId chunkIndex';
  const sort = { collectionId: 1, chunkIndex: 1, _id: 1 } as const;

  const dataCursor = MongoDatasetData.find(filter, fields)
    .sort(sort)
    .lean()
    .cursor({ batchSize: 500 });

  try {
    for await (const item of dataCursor) {
      if (typeof item.imageId !== 'string' || !item.imageId) continue;
      yield {
        dataId: String(item._id),
        collectionId: String(item.collectionId),
        imageId: item.imageId
      };
    }
  } finally {
    await dataCursor.close().catch(() => undefined);
  }

  // 图片训练成功前只存在于训练队列；补读这些记录，避免源文件已在 S3 但归档为空。
  const trainingCursor = MongoDatasetTraining.find(filter, fields)
    .sort(sort)
    .lean()
    .cursor({ batchSize: 500 });

  try {
    for await (const item of trainingCursor) {
      if (typeof item.imageId !== 'string' || !item.imageId) continue;
      yield {
        dataId: String(item._id),
        collectionId: String(item.collectionId),
        imageId: item.imageId
      };
    }
  } finally {
    await trainingCursor.close().catch(() => undefined);
  }
}

/** 按归档边界读取 Collection 权限解析所需的完整字段。 */
export const findArchiveCollectionPermissionItems = ({
  teamId,
  datasetId,
  collectionIds
}: {
  teamId: string;
  datasetId: string;
  collectionIds: string[];
}) =>
  MongoDatasetCollection.find(
    { teamId, datasetId, _id: { $in: collectionIds } },
    archiveCollectionPermissionFields
  ).lean<DatasetArchiveCollectionPermissionItem[]>();
