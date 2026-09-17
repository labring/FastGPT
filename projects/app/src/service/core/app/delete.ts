import type { ApiRequestProps } from '@fastgpt/next/type';
import { AppFolderTypeList } from '@fastgpt/global/core/app/constants';
import { OwnerPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { findAppAndAllChildren, deleteAppsImmediate } from '@fastgpt/service/core/app/controller';
import { addAppDeleteJob } from '@fastgpt/service/core/app/delete';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { pushTrack } from '@fastgpt/service/common/middle/tracks/utils';
import { addAuditLog, getI18nAppType } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

/**
 * 删除单个应用或文件夹及其子树，同步停用即时任务，投递异步清理队列，并记录审计与埋点。
 * 返回被删除的非文件夹应用 ID 列表（用于 DeleteAppResponseSchema 与前端本地缓存清理）。
 */
export const deleteApp = async ({
  req,
  appId
}: {
  req: ApiRequestProps;
  appId: string;
}): Promise<string[]> => {
  const { teamId, tmbId, userId, app } = await authApp({
    req,
    authToken: true,
    appId,
    per: OwnerPermissionVal
  });
  const deleteAppsList = await findAppAndAllChildren({ teamId, appId });
  const deleteIds = deleteAppsList.map((item) => item._id);

  await mongoSessionRun(async (session) => {
    await MongoApp.updateMany({ _id: deleteIds, teamId }, { deleteTime: new Date() }, { session });
    await deleteAppsImmediate({ teamId, appIds: deleteIds });
    await addAppDeleteJob({ teamId, appId });
  });

  addAuditLog({
    tmbId,
    teamId,
    event: AuditEventEnum.DELETE_APP,
    params: {
      appName: app.name,
      appType: getI18nAppType(app.type)
    }
  });
  pushTrack.countAppNodes({ teamId, tmbId, uid: userId, appId });

  return deleteAppsList
    .filter((item) => !AppFolderTypeList.includes(item.type))
    .map((item) => String(item._id));
};
