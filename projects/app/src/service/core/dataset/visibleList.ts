import {
  defaultSubtreeMaxNodes,
  getDescendantFolderIds
} from '@fastgpt/global/common/parentFolder/subtree';
import { getFolderPathIndex } from '@fastgpt/global/common/parentFolder/tree';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { serviceEnv } from '@fastgpt/service/env';

const logger = getLogger(LogCategories.MODULE.DATASET);

type DatasetFolderPathItem = {
  _id: string;
  parentId: string | null;
  ancestorIds: string[];
  type: DatasetTypeEnum.folder;
};

/** 加载当前知识库目录树的文件夹 ID，并基于 parentId 生成可用于浏览的路径。 */
export const getDatasetFolderListScope = async ({
  teamId,
  currentFolderId
}: {
  teamId: string;
  currentFolderId: string | null;
}): Promise<{ folders: DatasetFolderPathItem[]; folderIds: string[] }> => {
  const teamObjectId = new Types.ObjectId(teamId);
  const loadFolders = async (ids?: string[]) =>
    MongoDataset.find(
      {
        teamId: teamObjectId,
        deleteTime: null,
        type: DatasetTypeEnum.folder,
        ...(ids ? { _id: { $in: ids } } : {})
      },
      '_id parentId type ancestorIds'
    ).lean();

  const currentFolder = currentFolderId
    ? await MongoDataset.findOne({
        _id: currentFolderId,
        teamId: teamObjectId,
        deleteTime: null,
        type: DatasetTypeEnum.folder
      })
        .select('_id parentId type')
        .lean()
    : null;
  if (currentFolderId && !currentFolder) return { folders: [], folderIds: [] };

  const folderDocs = currentFolderId
    ? await (async () => {
        const [indexedDescendants, descendants] = await Promise.all([
          MongoDataset.find(
            {
              teamId: teamObjectId,
              deleteTime: null,
              type: DatasetTypeEnum.folder,
              ancestorIds: new Types.ObjectId(currentFolderId)
            },
            '_id'
          ).lean(),
          getDescendantFolderIds({
            rootIds: [currentFolderId],
            maxDepth: serviceEnv.MAX_FOLDER_DEPTH,
            maxNodes: defaultSubtreeMaxNodes,
            findChildFolders: async (parentIds) => {
              const children = await MongoDataset.find(
                {
                  teamId: teamObjectId,
                  deleteTime: null,
                  type: DatasetTypeEnum.folder,
                  parentId: { $in: parentIds }
                },
                '_id'
              ).lean();
              return children.map(({ _id }) => String(_id));
            }
          })
        ]);
        if (descendants.truncated) {
          logger.warn(
            `[getDatasetFolderListScope] parentId fallback traversal truncated: folderId=${currentFolderId}`
          );
        }
        const ids = new Set([
          currentFolderId,
          ...indexedDescendants.map(({ _id }) => String(_id)),
          ...descendants.ids
        ]);
        return loadFolders([...ids]);
      })()
    : await loadFolders();

  const paths = getFolderPathIndex({
    folders: folderDocs.map((folder) => ({
      id: String(folder._id),
      parentId: folder.parentId ? String(folder.parentId) : null
    })),
    currentFolderId,
    maxDepth: serviceEnv.MAX_FOLDER_DEPTH
  });
  const folders = folderDocs.flatMap((folder) => {
    const id = String(folder._id);
    const ancestorIds = paths.get(id);
    return ancestorIds === undefined
      ? []
      : [
          {
            _id: id,
            parentId: folder.parentId ? String(folder.parentId) : null,
            ancestorIds,
            type: DatasetTypeEnum.folder as const
          }
        ];
  });

  return { folders, folderIds: folders.map(({ _id }) => _id) };
};

/** 判断非所有者是否拥有文件夹真实读取权限，或可通过其可读子资源浏览。 */
export const hasReadableDatasetFolderChild = async ({
  teamId,
  folderIds,
  readableResourceIds
}: {
  teamId: string;
  folderIds: string[];
  readableResourceIds: string[];
}) => {
  if (folderIds.length === 0 || readableResourceIds.length === 0) return false;
  return Boolean(
    await MongoDataset.exists({
      teamId,
      deleteTime: null,
      _id: { $in: readableResourceIds },
      parentId: { $in: folderIds }
    })
  );
};
