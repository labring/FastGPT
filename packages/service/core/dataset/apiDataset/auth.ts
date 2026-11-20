import {
  ManagePermissionVal,
  WritePermissionVal
} from '@fastgpt/global/support/permission/constant';
import { authDatasetCollectionMoves } from '../../../support/permission/collection/moveAuth';
import { authDataset } from '../../../support/permission/dataset/auth';
import type { AuthModeType } from '../../../support/permission/type';
import type { ApiFileParentUpdate } from './utils';

export type ApiFileImportChanges = {
  /** 新建节点所在的最近已有父级；新目录由调用者创建，其下的写权限由该授权承接。 */
  creationParentIds: (string | null)[];
  newFolderIds: Set<string>;
  moves: ApiFileParentUpdate[];
  /** 兼容转换会复用旧目录权限，必须有该目录的 manage。 */
  permissionSourceIds?: string[];
  /** 重新恢复自动同步（syncChildren: false -> true）的已有目录 ID，必须具备目录 manage 权限。 */
  reEnableSyncFolderIds?: string[];
  /** 开启知识库根级 syncAll 开关，必须具备知识库 manage 权限。 */
  enableDatasetSyncAll?: boolean;
};

/**
 * 对实际导入计划鉴权：新建要求真实父级 write，移动沿用普通移动的源/目标 manage 与根目录团队权限；
 * 恢复暂停目录的 syncChildren 或开启 Dataset.syncAll 均要求对应资源的 manage 权限。
 */
export const authApiFileImportChanges = async ({
  datasetId,
  creationParentIds,
  newFolderIds,
  moves,
  permissionSourceIds = [],
  reEnableSyncFolderIds = [],
  enableDatasetSyncAll = false,
  ...auth
}: AuthModeType & ApiFileImportChanges & { datasetId: string }): Promise<void> => {
  if (enableDatasetSyncAll) {
    await authDataset({
      ...auth,
      datasetId,
      per: ManagePermissionVal
    });
  }

  const manageCollectionIds = [...new Set([...permissionSourceIds, ...reEnableSyncFolderIds])];
  await authDatasetCollectionMoves({
    ...auth,
    datasetId,
    creationParentIds,
    newFolderIds,
    moves: moves
      .filter((item) => item.oldParentId !== item.newParentId)
      .map((item) => ({ collectionId: item._id, targetParentId: item.newParentId })),
    // 仅清理远端父字段仍按节点 write 校验。
    collectionChecks: [
      ...moves
        .filter((item) => item.oldParentId === item.newParentId)
        .map((item) => ({ collectionId: item._id, per: WritePermissionVal })),
      ...manageCollectionIds.map((collectionId) => ({ collectionId, per: ManagePermissionVal }))
    ]
  });
};
