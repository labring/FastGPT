import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import {
  ManagePermissionVal,
  ReadPermissionVal,
  WritePermissionVal
} from '@fastgpt/global/support/permission/constant';
import { TeamDatasetCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import {
  authDatasetCollection,
  authDatasetCollectionCreate
} from '../../../support/permission/dataset/auth';
import { authUserPer } from '../../../support/permission/user/auth';
import type { AuthModeType } from '../../../support/permission/type';
import type { ApiFileParentUpdate } from './utils';

export type ApiFileImportChanges = {
  /** 新建节点所在的最近已有父级；新目录由调用者创建，其下的写权限由该授权承接。 */
  creationParentIds: (string | null)[];
  newFolderIds: Set<string>;
  moves: ApiFileParentUpdate[];
};

/**
 * 对实际导入计划鉴权：新建要求真实父级 write，移动沿用普通移动的源/目标 manage 与根目录团队权限。
 * 本轮新建目录的 owner 是调用者，创建授权通过后无需查询尚未落库的目录；已有目录必须独立鉴权。
 */
export const authApiFileImportChanges = async ({
  datasetId,
  creationParentIds,
  newFolderIds,
  moves,
  ...auth
}: AuthModeType & ApiFileImportChanges & { datasetId: string }): Promise<void> => {
  const checked = new Set<string>();
  const checkCollection = async (collectionId: string, per: number) => {
    const key = `${collectionId}:${per}`;
    if (checked.has(key)) return;
    const { collection } = await authDatasetCollection({ ...auth, collectionId, per });
    if (String(collection.datasetId) !== datasetId) throw DatasetErrEnum.unAuthDatasetCollection;
    checked.add(key);
  };

  // 创建目录和文件前，核对由远端树解析出来的真实授权边界。
  for (const parentId of new Set(creationParentIds)) {
    if (parentId) await checkCollection(parentId, WritePermissionVal);
    else await authDatasetCollectionCreate({ ...auth, datasetId });
  }

  let requiresRootMove = false;
  for (const item of moves) {
    // 仅清理远端父字段不改变本地落位，不扩大为管理权限操作。
    if (item.oldParentId === item.newParentId) {
      await checkCollection(item._id, WritePermissionVal);
      continue;
    }
    await checkCollection(item._id, ReadPermissionVal);
    if (item.oldParentId) await checkCollection(item.oldParentId, ManagePermissionVal);
    if (item.newParentId && !newFolderIds.has(item.newParentId)) {
      await checkCollection(item.newParentId, ManagePermissionVal);
    }
    requiresRootMove ||= !item.oldParentId || !item.newParentId;
  }
  if (requiresRootMove) await authUserPer({ ...auth, per: TeamDatasetCreatePermissionVal });
};
