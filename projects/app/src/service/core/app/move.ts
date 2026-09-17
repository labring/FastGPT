import type { ApiRequestProps } from '@fastgpt/next/type';
import { AppFolderTypeList, AppTypeEnum } from '@fastgpt/global/core/app/constants';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import {
  ManagePermissionVal,
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { TeamAppCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { getResourceOwnedClbs } from '@fastgpt/service/support/permission/controller';
import {
  syncChildrenPermission,
  syncCollaborators
} from '@fastgpt/service/support/permission/inheritPermission';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { checkMoveFolderDepth } from '@fastgpt/service/common/parentFolder/depth';
import { parseParentIdInMongo } from '@fastgpt/global/common/parentFolder/utils';
import { getS3AvatarSource } from '@fastgpt/service/common/s3/sources/avatar';
import { addAuditLog, getI18nAppType } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { updateParentFoldersUpdateTime } from '@fastgpt/service/core/app/controller';

const logAppMove = ({
  tmbId,
  teamId,
  app,
  targetName
}: {
  tmbId: string;
  teamId: string;
  app: any;
  targetName: string;
}) => {
  addAuditLog({
    tmbId,
    teamId,
    event: AuditEventEnum.MOVE_APP,
    params: {
      appName: app.name,
      targetFolderName: targetName,
      appType: getI18nAppType(app.type)
    }
  });
};

/** 移动单个应用或文件夹，处理深度、权限继承与更新时间更新。 */
export const moveApp = async ({
  req,
  appId,
  parentId
}: {
  req: ApiRequestProps;
  appId: string;
  parentId: ParentIdType;
}) => {
  const { app, teamId, tmbId } = await authApp({
    req,
    authToken: true,
    appId,
    per: ReadPermissionVal
  });

  let targetName = 'root';
  if (parentId) {
    const { app: targetApp } = await authApp({
      req,
      authToken: true,
      appId: parentId,
      per: ManagePermissionVal
    });
    targetName = targetApp.name;
  }

  if (app.parentId) {
    await authApp({ req, authToken: true, appId: app.parentId, per: ManagePermissionVal });
  }
  if (parentId === null || !app.parentId) {
    await authUserPer({
      req,
      authToken: true,
      per: TeamAppCreatePermissionVal
    });
  }

  const isFolderType =
    app.type === AppTypeEnum.toolFolder
      ? (type: string) => type === AppTypeEnum.toolFolder
      : app.type === AppTypeEnum.folder
        ? (type: string) => type === AppTypeEnum.folder
        : () => false;

  await checkMoveFolderDepth({
    resourceId: appId,
    targetParentId: parentId,
    teamId: app.teamId,
    model: MongoApp,
    isFolderType
  });

  await mongoSessionRun(async (session) => {
    const [parentClbs, oldParentClbs, oldResourceClbs] = await Promise.all([
      getResourceOwnedClbs({
        teamId: app.teamId,
        resourceId: parentId,
        resourceType: PerResourceTypeEnum.app,
        session
      }),
      app.parentId
        ? getResourceOwnedClbs({
            teamId: app.teamId,
            resourceId: app.parentId,
            resourceType: PerResourceTypeEnum.app,
            session
          })
        : Promise.resolve([]),
      getResourceOwnedClbs({
        teamId: app.teamId,
        resourceId: app._id,
        resourceType: PerResourceTypeEnum.app,
        session
      })
    ]);

    const newResourceClbs = await syncCollaborators({
      resourceId: app._id,
      resourceType: PerResourceTypeEnum.app,
      collaborators: parentClbs,
      oldParentCollaborators: oldParentClbs,
      session,
      teamId: app.teamId
    });

    await syncChildrenPermission({
      resource: app,
      resourceType: PerResourceTypeEnum.app,
      resourceModel: MongoApp,
      folderTypeList: AppFolderTypeList,
      oldParentCollaborators: oldResourceClbs,
      newParentCollaborators: newResourceClbs,
      session
    });

    await getS3AvatarSource().refreshAvatar(undefined, app.avatar, session);
    await MongoApp.findByIdAndUpdate(
      appId,
      {
        ...parseParentIdInMongo(parentId),
        inheritPermission: true,
        updateTime: new Date()
      },
      { session }
    );
  });

  updateParentFoldersUpdateTime({ parentId: app.parentId });
  updateParentFoldersUpdateTime({ parentId });

  logAppMove({ tmbId, teamId, app, targetName });
};
