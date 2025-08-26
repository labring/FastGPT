import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { AppFolderTypeList } from '@fastgpt/global/core/app/constants';
import { syncChildrenPermission } from '@fastgpt/service/support/permission/inheritPermission';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { getResourceClbs } from '@fastgpt/service/support/permission/controller';
import { addLog } from '@fastgpt/service/common/system/log';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';

export type SyncAppChatLogQuery = {};

export type SyncAppChatLogBody = {
  batchSize?: number;
};

export type SyncAppChatLogResponse = {};

/**
 * 初始化脚本 v4.13.0
 * 权限表数据更新：直接对系统内所有资源（没有 parentId 顶层的 Folder，以及没有 inheritPermission 的有 parentId 的Folder），执行一次 syncChildrenPermission 函数。
 * 包括：App 和 Dataset 的权限同步
 */
async function handler(
  req: ApiRequestProps<SyncAppChatLogBody, SyncAppChatLogQuery>,
  res: ApiResponseType<SyncAppChatLogResponse>
) {
  await authCert({ req, authRoot: true });
  // 1. update App's
  const appFolders = await MongoApp.find({
    $or: [
      {
        parentId: null,
        type: { $in: AppFolderTypeList }
      },
      {
        parentId: { $exists: true },
        inheritPermission: false,
        type: { $in: AppFolderTypeList }
      }
    ]
  }).lean();
  addLog.info(`start sync app children permission, total: ${appFolders.length}`);
  for (const folder of appFolders) {
    await mongoSessionRun(async (session) => {
      const clbs = await getResourceClbs({
        resourceType: PerResourceTypeEnum.app,
        resourceId: folder._id,
        teamId: folder.teamId,
        session
      });
      await syncChildrenPermission({
        folderTypeList: AppFolderTypeList,
        resource: folder,
        session,
        resourceModel: MongoApp,
        resourceType: PerResourceTypeEnum.app,
        collaborators: clbs
      });
    });
    addLog.debug(
      `sync app children permission, folderId: ${folder._id}, progress: ${appFolders.indexOf(folder) + 1}/${appFolders.length}`
    );
  }
  addLog.info('sync app children permission completed');

  // 2. update Dataset's
  const datasetFolders = await MongoDataset.find({
    $or: [
      {
        parentId: null,
        type: DatasetTypeEnum.folder
      },
      {
        parentId: { $exists: true },
        inheritPermission: false,
        type: DatasetTypeEnum.folder
      }
    ]
  }).lean();

  addLog.info(`start sync dataset children permission, total: ${datasetFolders.length}`);

  for (const folder of datasetFolders) {
    await mongoSessionRun(async (session) => {
      const clbs = await getResourceClbs({
        resourceType: PerResourceTypeEnum.dataset,
        resourceId: folder._id,
        teamId: folder.teamId,
        session
      });

      await syncChildrenPermission({
        folderTypeList: [DatasetTypeEnum.folder],
        resource: folder,
        session,
        resourceModel: MongoDataset,
        resourceType: PerResourceTypeEnum.dataset,
        collaborators: clbs
      });
    });

    addLog.debug(
      `sync dataset children permission, folderId: ${folder._id}, progress: ${datasetFolders.indexOf(folder) + 1}/${datasetFolders.length}`
    );
  }

  addLog.info('sync dataset children permission completed');

  return {
    message: 'App and Dataset permission sync completed successfully'
  };
}

export default NextAPI(handler);
