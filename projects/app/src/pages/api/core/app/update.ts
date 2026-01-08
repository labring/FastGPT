import { MongoApp } from '@fastgpt/service/core/app/schema';
import type { AppUpdateParams } from '@/global/core/app/api';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { beforeUpdateAppFormat } from '@fastgpt/service/core/app/controller';
import { NextAPI } from '@/service/middleware/entry';
import {
  ManagePermissionVal,
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { parseParentIdInMongo } from '@fastgpt/global/common/parentFolder/utils';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import {
  syncChildrenPermission,
  syncCollaborators
} from '@fastgpt/service/support/permission/inheritPermission';
import { AppFolderTypeList, AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { type ClientSession } from 'mongoose';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { getResourceOwnedClbs } from '@fastgpt/service/support/permission/controller';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { TeamAppCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getI18nAppType } from '@fastgpt/service/support/user/audit/util';
import { i18nT } from '@fastgpt/web/i18n/utils';
import { getS3AvatarSource } from '@fastgpt/service/common/s3/sources/avatar';
import { updateParentFoldersUpdateTime } from '@fastgpt/service/core/app/controller';

export type AppUpdateQuery = {
  appId: string;
};

export type AppUpdateBody = AppUpdateParams;

// 更新应用接口
// 包括如下功能：
// 1. 更新应用的信息（包括名称，类型，头像，介绍等）
// 2. 更新应用的编排信息
// 3. 移动应用
// 操作权限：
// 1. 更新信息和工作流编排需要有应用的写权限
// 2. 移动应用需要有
//  (1) 父目录的管理权限
//  (2) 目标目录的管理权限
//  (3) 如果从根目录移动或移动到根目录，需要有团队的应用创建权限
async function handler(req: ApiRequestProps<AppUpdateBody, AppUpdateQuery>) {
  const { parentId, name, avatar, type, intro, nodes, edges, chatConfig, teamTags } = req.body;

  const { appId } = req.query;

  if (!appId) {
    Promise.reject(CommonErrEnum.missingParams);
  }
  const isMove = parentId !== undefined;

  // this step is to get the app and its permission, and we will check the permission manually for
  // different cases
  const { app, permission, teamId, tmbId } = await authApp({
    req,
    authToken: true,
    appId,
    per: ReadPermissionVal
  });

  if (!app) {
    Promise.reject(AppErrEnum.unExist);
  }

  let targetName = '';

  if (isMove) {
    if (parentId) {
      // move to a folder, check the target folder's permission
      const { app: targetApp } = await authApp({
        req,
        authToken: true,
        appId: parentId,
        per: ManagePermissionVal
      });

      targetName = targetApp.name;
    } else {
      targetName = 'root';
    }

    if (app.parentId) {
      // move from a folder, check the (old) folder's permission
      await authApp({ req, authToken: true, appId: app.parentId, per: ManagePermissionVal });
    }
    if (parentId === null || !app.parentId) {
      // move to root or move from root
      await authUserPer({
        req,
        authToken: true,
        per: TeamAppCreatePermissionVal
      });
    }
  } else {
    // is not move, write permission of the app.
    if (!permission.hasWritePer) {
      return Promise.reject(AppErrEnum.unAuthApp);
    }
  }

  const onUpdate = async (session?: ClientSession) => {
    // format nodes data
    // 1. dataset search limit, less than model quoteMaxToken
    beforeUpdateAppFormat({
      nodes
    });

    if (app.type === AppTypeEnum.mcpToolSet && avatar) {
      await MongoApp.updateMany({ parentId: appId, teamId: app.teamId }, { avatar }, { session });
    }

    await getS3AvatarSource().refreshAvatar(avatar, app.avatar, session);

    const result = await MongoApp.findByIdAndUpdate(
      appId,
      {
        ...parseParentIdInMongo(parentId),
        ...(name && { name }),
        ...(type && { type }),
        ...(avatar && { avatar }),
        ...(intro !== undefined && { intro }),
        ...(teamTags && { teamTags }),
        ...(nodes && {
          modules: nodes
        }),
        ...(edges && {
          edges
        }),
        ...(chatConfig && { chatConfig }),
        ...(isMove && { inheritPermission: true }),
        updateTime: new Date()
      },
      { session }
    );

    if (isMove) {
      // Update both old and new parent folders
      updateParentFoldersUpdateTime({
        parentId: app.parentId
      });
      updateParentFoldersUpdateTime({
        parentId
      });
    } else {
      // Update current parent folder
      updateParentFoldersUpdateTime({
        parentId: parentId || app.parentId
      });
    }

    return result;
  };

  // Move
  if (isMove) {
    await mongoSessionRun(async (session) => {
      // Inherit folder: Sync children permission and it's clbs
      const parentClbs = await getResourceOwnedClbs({
        teamId: app.teamId,
        resourceId: parentId,
        resourceType: PerResourceTypeEnum.app,
        session
      });
      // sync self
      await syncCollaborators({
        resourceId: app._id,
        resourceType: PerResourceTypeEnum.app,
        collaborators: parentClbs,
        session,
        teamId: app.teamId
      });
      // sync the children
      await syncChildrenPermission({
        resource: app,
        resourceType: PerResourceTypeEnum.app,
        resourceModel: MongoApp,
        folderTypeList: AppFolderTypeList,
        collaborators: parentClbs,
        session
      });
      logAppMove({ tmbId, teamId, app, targetName });
      return onUpdate(session);
    });
  } else {
    logAppUpdate({ tmbId, teamId, app, name, intro });

    return onUpdate();
  }
}

export default NextAPI(handler);

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

const logAppUpdate = ({
  tmbId,
  teamId,
  app,
  name,
  intro
}: {
  tmbId: string;
  teamId: string;
  app: any;
  name?: string;
  intro?: string;
}) => {
  const getUpdateItems = () => {
    const names: string[] = [];
    const values: string[] = [];

    if (name !== undefined) {
      names.push(i18nT('common:name'));
      values.push(name);
    }

    if (intro !== undefined) {
      names.push(i18nT('common:Intro'));
      values.push(intro);
    }

    return {
      names,
      values
    };
  };

  const { names: newItemNames, values: newItemValues } = getUpdateItems();

  addAuditLog({
    tmbId,
    teamId,
    event: AuditEventEnum.UPDATE_APP_INFO,
    params: {
      appName: app.name,
      newItemNames: newItemNames,
      newItemValues: newItemValues,
      appType: getI18nAppType(app.type)
    }
  });
};
