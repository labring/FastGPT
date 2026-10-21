import { getFolderPathIndex } from '@fastgpt/global/common/parentFolder/tree';
import { getVisibleChildren } from '@fastgpt/global/common/parentFolder/visibleChildren';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import type { PermissionValueType } from '@fastgpt/global/support/permission/type';
import { Types } from '@fastgpt/service/common/mongo';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { serviceEnv } from '@fastgpt/service/env';
import {
  getReadableCollectionIds,
  type CollectionPermissionItemType
} from '@fastgpt/service/support/permission/collection/auth';
import { getGroupsByTmbId } from '@fastgpt/service/support/permission/memberGroup/controllers';
import { getOrgIdSetWithParentByTmbId } from '@fastgpt/service/support/permission/org/controllers';

/** 解析 Collection 可见性所需的最小字段。 */
export const collectionVisibilityFields = '_id type parentId tmbId inheritPermission datasetId';

/**
 * 加载一个知识库内全部 Collection 的权限解析字段。
 * Collection 没有持久化的祖先路径，浏览导航目录时必须拿到整棵目录树才能判断后代是否可读。
 */
export const findDatasetCollectionsForVisibility = async ({
  teamId,
  datasetId
}: {
  teamId: string;
  datasetId: string;
}) =>
  MongoDatasetCollection.find(
    {
      teamId: new Types.ObjectId(teamId),
      datasetId: new Types.ObjectId(datasetId)
    },
    collectionVisibilityFields,
    { ...readFromSecondary }
  ).lean<CollectionPermissionItemType[]>();

/**
 * 计算 currentFolderId 下的可见直接子级。
 * 直接可读的 Collection 为 read；仅因为后代可读而出现的文件夹带 navigate 标记。
 * currentFolderId 为 null 表示知识库根目录。
 */
export const getCollectionVisibleChildren = ({
  currentFolderId,
  collections,
  readableIds
}: {
  currentFolderId: string | null;
  collections: CollectionPermissionItemType[];
  readableIds: string[];
}) => {
  const toParentId = (parentId: unknown) => (parentId ? String(parentId) : null);
  const folderDocs = collections.filter(({ type }) => type === DatasetCollectionTypeEnum.folder);
  const paths = getFolderPathIndex({
    folders: folderDocs.map((folder) => ({
      id: String(folder._id),
      parentId: toParentId(folder.parentId)
    })),
    currentFolderId,
    maxDepth: serviceEnv.MAX_FOLDER_DEPTH
  });
  const folders = folderDocs.flatMap((folder) => {
    const id = String(folder._id);
    const ancestorIds = paths.get(id);
    return ancestorIds === undefined
      ? []
      : [{ _id: id, parentId: toParentId(folder.parentId), ancestorIds, type: folder.type }];
  });
  const readableIdSet = new Set(readableIds);

  return getVisibleChildren({
    currentFolderId,
    readableResources: collections
      .filter(({ _id }) => readableIdSet.has(String(_id)))
      .map((item) => ({
        _id: String(item._id),
        parentId: toParentId(item.parentId),
        type: item.type
      })),
    folders,
    folderTypes: [DatasetCollectionTypeEnum.folder],
    includedFolderTypes: [DatasetCollectionTypeEnum.folder]
  });
};

/**
 * 判断文件夹是否可以作为导航目录进入：自身不可读，但其子树内存在可读 Collection。
 * 以文件夹的父级为浏览根，检查它是否出现在父级的可见子级中，与列表展示保持同一规则。
 */
export const isCollectionFolderNavigable = ({
  folderId,
  collections,
  readableIds
}: {
  folderId: string;
  collections: CollectionPermissionItemType[];
  readableIds: string[];
}) => {
  const folder = collections.find(({ _id }) => String(_id) === folderId);
  if (!folder || folder.type !== DatasetCollectionTypeEnum.folder) return false;

  return getCollectionVisibleChildren({
    currentFolderId: folder.parentId ? String(folder.parentId) : null,
    collections,
    readableIds
  }).some(({ id }) => id === folderId);
};

/**
 * 校验目标文件夹是否是当前成员的导航目录。
 * 调用方需已通过 Dataset 读权限校验，并确认文件夹自身没有读权限。
 */
export const checkCollectionFolderNavigable = async ({
  teamId,
  tmbId,
  datasetId,
  folderId,
  datasetPermission,
  collectionPermissionEnabled
}: {
  teamId: string;
  tmbId: string;
  datasetId: string;
  folderId: string;
  datasetPermission: PermissionValueType;
  collectionPermissionEnabled?: boolean;
}) => {
  const [collections, groupIds, orgIds] = await Promise.all([
    findDatasetCollectionsForVisibility({ teamId, datasetId }),
    getGroupsByTmbId({ tmbId, teamId }).then((list) => list.map((item) => String(item._id))),
    getOrgIdSetWithParentByTmbId({ tmbId, teamId }).then((set) => Array.from(set))
  ]);
  const readableIds = await getReadableCollectionIds({
    collections,
    tmbId,
    teamId,
    groupIds,
    orgIds,
    datasetPermission,
    collectionPermissionEnabled
  });

  return isCollectionFolderNavigable({ folderId, collections, readableIds });
};
