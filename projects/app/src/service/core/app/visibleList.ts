import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import {
  getDescendantFolderIds,
  defaultSubtreeMaxNodes
} from '@fastgpt/global/common/parentFolder/subtree';
import { getFolderPathIndex } from '@fastgpt/global/common/parentFolder/tree';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { Types } from '@fastgpt/service/common/mongo';
import { serviceEnv } from '@fastgpt/service/env';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';

const appPathFolderTypes = [AppTypeEnum.folder, AppTypeEnum.toolFolder] as const;
const logger = getLogger(LogCategories.MODULE.APP);

type AppFolderPathItem = {
  _id: string;
  parentId: string | null;
  ancestorIds: string[];
  type: AppTypeEnum.folder | AppTypeEnum.toolFolder;
};

/** 加载当前目录树的文件夹 ID，并基于 parentId 生成可用于浏览的路径。 */
export const getAppFolderListScope = async ({
  teamId,
  currentFolderId
}: {
  teamId: string;
  currentFolderId: string | null;
}): Promise<{ folders: AppFolderPathItem[]; folderIds: string[] }> => {
  const teamObjectId = new Types.ObjectId(teamId);
  const loadFolders = async ({
    type,
    ids
  }: {
    type?: AppTypeEnum.folder | AppTypeEnum.toolFolder;
    ids?: string[];
  } = {}) =>
    MongoApp.find(
      {
        teamId: teamObjectId,
        deleteTime: null,
        type: type ?? { $in: appPathFolderTypes },
        ...(ids ? { _id: { $in: ids } } : {})
      },
      '_id parentId type ancestorIds'
    ).lean();

  const currentFolder = currentFolderId
    ? await MongoApp.findOne({
        _id: currentFolderId,
        teamId: teamObjectId,
        deleteTime: null,
        type: { $in: appPathFolderTypes }
      })
        .select('_id parentId type')
        .lean()
    : null;
  if (currentFolderId && !currentFolder) return { folders: [], folderIds: [] };

  const types = currentFolder
    ? [currentFolder.type as AppTypeEnum.folder | AppTypeEnum.toolFolder]
    : [...appPathFolderTypes];
  const folderDocs = currentFolderId
    ? await (async () => {
        const type = currentFolder?.type as AppTypeEnum.folder | AppTypeEnum.toolFolder;
        const [indexedDescendants, descendants] = await Promise.all([
          MongoApp.find(
            {
              teamId: teamObjectId,
              deleteTime: null,
              type,
              ancestorIds: new Types.ObjectId(currentFolderId)
            },
            '_id'
          ).lean(),
          getDescendantFolderIds({
            rootIds: [currentFolderId],
            maxDepth: serviceEnv.MAX_FOLDER_DEPTH,
            maxNodes: defaultSubtreeMaxNodes,
            findChildFolders: async (parentIds) => {
              const children = await MongoApp.find(
                { teamId: teamObjectId, deleteTime: null, type, parentId: { $in: parentIds } },
                '_id'
              ).lean();
              return children.map(({ _id }) => String(_id));
            }
          })
        ]);
        if (descendants.truncated) {
          logger.warn(
            `[getAppFolderListScope] parentId fallback traversal truncated: folderId=${currentFolderId}`
          );
        }
        const ids = new Set([
          currentFolderId,
          ...indexedDescendants.map(({ _id }) => String(_id)),
          ...descendants.ids
        ]);
        return loadFolders({ type, ids: [...ids] });
      })()
    : await loadFolders();

  const folderNodes = folderDocs.map((folder) => ({
    id: String(folder._id),
    parentId: folder.parentId ? String(folder.parentId) : null,
    type: folder.type
  }));
  const folderPaths = new Map<string, string[]>();
  for (const type of types) {
    const typePaths = getFolderPathIndex({
      folders: folderNodes.filter((folder) => folder.type === type),
      currentFolderId,
      maxDepth: serviceEnv.MAX_FOLDER_DEPTH
    });
    typePaths.forEach((path, id) => folderPaths.set(id, path));
  }

  const folders = folderDocs.flatMap((folder) => {
    const id = String(folder._id);
    const ancestorIds = folderPaths.get(id);
    return ancestorIds === undefined
      ? []
      : [
          {
            _id: id,
            parentId: folder.parentId ? String(folder.parentId) : null,
            ancestorIds,
            type: folder.type as AppFolderPathItem['type']
          }
        ];
  });
  return { folders, folderIds: folders.map(({ _id }) => _id) };
};

/** 判断非所有者是否拥有文件夹真实读取权限，或可通过其可读子资源浏览。 */
export const hasReadableAppFolderChild = async ({
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
    await MongoApp.exists({
      teamId,
      deleteTime: null,
      _id: { $in: readableResourceIds },
      parentId: { $in: folderIds }
    })
  );
};
