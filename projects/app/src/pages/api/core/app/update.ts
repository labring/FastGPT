import { MongoApp } from '@fastgpt/service/core/app/schema';
import type { AppUpdateParams } from '@/global/core/app/api';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { beforeUpdateAppFormat } from '@fastgpt/service/core/app/controller';
import { NextAPI } from '@/service/middleware/entry';
import {
  ManagePermissionVal,
  PerResourceTypeEnum,
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

// update the app information or move the app to another folder
async function handler(req: ApiRequestProps<AppUpdateBody, AppUpdateQuery>) {
  const { parentId, name, avatar, type, intro, nodes, edges, chatConfig, teamTags } = req.body;

  const { appId } = req.query;

  if (!appId) {
    Promise.reject(CommonErrEnum.missingParams);
  }
  const isMove = parentId !== undefined;

  // the lowest permission is WritePermissionVal to invoke this api, thus we can authApp with WritePermissionVal first.
  const { app, permission } = await authApp({
    req,
    authToken: true,
    appId,
    per: WritePermissionVal
  });
  if (!app) {
    Promise.reject(AppErrEnum.unExist);
  }

  if (isMove) {
    if (parentId) {
      // move to a folder, check the target folder's permission
      await authApp({ req, authToken: true, appId: parentId, per: ManagePermissionVal });
    } else if (parentId === null || !app.parentId) {
      // move to root or move from root
      await authUserPer({
        req,
        authToken: true,
        per: TeamWritePermissionVal
      });
    }
    if (app.parentId) {
      // move from a folder, check the (old) folder's permission
      await authApp({ req, authToken: true, appId: app.parentId, per: ManagePermissionVal });
    } else {
      // move from root
      if (!permission.hasManagePer) return Promise.reject(AppErrEnum.unAuthApp);
    }
  }

  // format nodes data
  // 1. dataset search limit, less than model quoteMaxToken
  const isFolder = AppFolderTypeList.includes(app.type);

  const onUpdate = async (session?: ClientSession) => {
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
      if (isFolder) {
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
