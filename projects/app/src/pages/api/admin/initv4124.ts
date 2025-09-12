import { NextAPI } from '@/service/middleware/entry';
import { OwnerRoleVal, PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';

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
  const [apps, datasets, tmbs] = await Promise.all([
    MongoApp.find({}, '_id teamId tmbId').lean(),
    MongoDataset.find({}, '_id teamId tmbId').lean(),
    MongoTeamMember.find({ role: 'owner' }, '_id teamId').lean()
  ]);

  await MongoResourcePermission.bulkWrite(
    apps.map((app) => ({
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
    }))
  );

  await MongoResourcePermission.bulkWrite(
    datasets.map((dataset) => ({
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
  );

  await MongoResourcePermission.bulkWrite(
    tmbs.map((team) => ({
      deleteOne: {
        filter: {
          resourceType: PerResourceTypeEnum.team,
          teamId: team.teamId,
          tmbId: team._id
        }
      }
    }))
  );

  return {
    message: 'Success'
  };
}

export default NextAPI(handler);
