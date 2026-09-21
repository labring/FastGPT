import { MongoDatasetCollection } from '../schema';
import type { DatasetCollectionSchemaType } from '@fastgpt/global/core/dataset/type';

export type DatasetArchiveCollection = {
  collectionId: string;
  parentId: string | null;
  name: string;
  type: string;
  fileId?: string;
};

const archiveCollectionFields = '_id parentId name type fileId';
const archiveCollectionPermissionFields =
  '_id datasetId tmbId parentId inheritPermission type';

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

/** 按可信团队和知识库边界批量读取一层子 Collection。 */
export const findArchiveCollectionsByParentIds = async ({
  teamId,
  datasetId,
  parentIds
}: {
  teamId: string;
  datasetId: string;
  parentIds: string[];
}) => {
  const collections = await MongoDatasetCollection.find(
    { teamId, datasetId, parentId: { $in: parentIds } },
    archiveCollectionFields
  ).lean();

  return collections.map(normalizeArchiveCollection);
};

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
