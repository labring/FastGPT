import { MongoApp } from '@fastgpt/service/core/app/schema';
import type { AppUpdateParams } from '@/global/core/app/api';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { beforeUpdateAppFormat } from '@fastgpt/service/core/app/controller';
import { NextAPI } from '@/service/middleware/entry';
import {
  ManagePermissionVal,
  PerResourceTypeEnum,
  ReadPermissionVal,
  WritePermissionVal
} from '@fastgpt/global/support/permission/constant';
import { parseParentIdInMongo } from '@fastgpt/global/common/parentFolder/utils';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import {
  syncChildrenPermission,
  syncCollaborators
} from '@fastgpt/service/support/permission/inheritPermission';
import { AppFolderTypeList } from '@fastgpt/global/core/app/constants';
import { ClientSession } from 'mongoose';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { getResourceClbsAndGroups } from '@fastgpt/service/support/permission/controller';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { TeamWritePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';

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
  const { app, permission } = await authApp({
    req,
    authToken: true,
    appId,
    per: ReadPermissionVal
  });

  if (!app) {
    Promise.reject(AppErrEnum.unExist);
  }

  if (isMove) {
    if (parentId) {
      // move to a folder, check the target folder's permission
      await authApp({ req, authToken: true, appId: parentId, per: ManagePermissionVal });
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
        per: TeamWritePermissionVal
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
    const { nodes: formatNodes } = beforeUpdateAppFormat({ nodes });

    return MongoApp.findByIdAndUpdate(
      appId,
      {
        ...parseParentIdInMongo(parentId),
        ...(name && { name }),
        ...(type && { type }),
        ...(avatar && { avatar }),
        ...(intro !== undefined && { intro }),
        ...(teamTags && { teamTags }),
        ...(formatNodes && {
          modules: formatNodes
        }),
        ...(edges && {
          edges
        }),
        ...(chatConfig && { chatConfig }),
        ...(isMove && { inheritPermission: true })
      },
      { session }
    );
  };

  // Move
  if (isMove) {
    await mongoSessionRun(async (session) => {
      // Inherit folder: Sync children permission and it's clbs
      if (AppFolderTypeList.includes(app.type)) {
        const parentClbsAndGroups = await getResourceClbsAndGroups({
          teamId: app.teamId,
          resourceId: parentId,
          resourceType: PerResourceTypeEnum.app,
          session
        });
        // sync self
        await syncCollaborators({
          resourceId: app._id,
          resourceType: PerResourceTypeEnum.app,
          collaborators: parentClbsAndGroups,
          session,
          teamId: app.teamId
        });
        // sync the children
        await syncChildrenPermission({
          resource: app,
          resourceType: PerResourceTypeEnum.app,
          resourceModel: MongoApp,
          folderTypeList: AppFolderTypeList,
          collaborators: parentClbsAndGroups,
          session
        });
      }
      return onUpdate(session);
    });
  } else {
    return onUpdate();
  }
}

export default NextAPI(handler);
