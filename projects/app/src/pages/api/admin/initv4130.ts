import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { AppFolderTypeList } from '@fastgpt/global/core/app/constants';
import { syncChildrenPermission } from '@fastgpt/service/support/permission/inheritPermission';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { OwnerRoleVal, PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { getResourceClbs } from '@fastgpt/service/support/permission/controller';
import { addLog } from '@fastgpt/service/common/system/log';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';

export type SyncAppChatLogQuery = {};

export type SyncAppChatLogBody = {
  batchSize?: number;
};

export type SyncAppChatLogResponse = {};

/**
 * 初始化脚本 v4.13.0
 * 对系统内所有资源 App 和 dataset 添加 tmbId 为自己 owner 的协作者，权限为 OwnerRoleVal
 */
async function handler(
  req: ApiRequestProps<SyncAppChatLogBody, SyncAppChatLogQuery>,
  res: ApiResponseType<SyncAppChatLogResponse>
) {
  await authCert({ req, authRoot: true });

  // find all resources
  const [apps, datasets] = await Promise.all([MongoApp.find().lean(), MongoDataset.find().lean()]);

  await MongoResourcePermission.bulkWrite([
    ...apps.map((app) => ({
      updateOne: {
        filter: {
          resourceId: app._id,
          resourceType: PerResourceTypeEnum.app,
          teamId: app.teamId,
          tmbId: app.tmbId
        },
        update: {
          permission: OwnerRoleVal
        },
        upsert: true
      }
    })),
    ...datasets.map((dataset) => ({
      updateOne: {
        filter: {
          resourceId: dataset._id,
          resourceType: PerResourceTypeEnum.dataset,
          teamId: dataset.teamId,
          tmbId: dataset.tmbId
        },
        update: {
          permission: OwnerRoleVal
        },
        upsert: true
      }
    }))
  ]);

  return {
    message: 'App and Dataset owner collaborator create completed successfully'
  };
}

export default NextAPI(handler);
