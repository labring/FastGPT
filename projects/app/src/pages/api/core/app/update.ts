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
import { PermissionValueType } from '@fastgpt/global/support/permission/type';
import { getResourceAllClbs } from '@fastgpt/service/support/permission/controller';
import { AppDefaultPermissionVal } from '@fastgpt/global/support/permission/app/constant';

/* 
  修改默认权限
  1. 继承态目录：关闭继承态，修改权限，同步子目录默认权限
  2. 继承态资源：关闭继承态，修改权限, 复制父级协作者。
  3. 非继承目录：修改权限，同步子目录默认权限
  4. 非继承资源：修改权限

  移动
  1. 继承态目录：改 parentId, 修改成父的默认权限，同步子目录默认权限和协作者
  2. 继承态资源：改 parentId
  3. 非继承：改 parentId
*/

async function handler(req: ApiRequestProps<AppUpdateParams, { appId: string }>) {
  const {
    parentId,
    name,
    avatar,
    type,
    intro,
    nodes,
    edges,
    chatConfig,
    teamTags,
    defaultPermission
  } = req.body as AppUpdateParams;

  const { appId } = req.query as { appId: string };

  if (!appId) {
    Promise.reject(CommonErrEnum.missingParams);
  }

  const { app } = await (async () => {
    if (defaultPermission !== undefined) {
      // if defaultPermission or inheritPermission is set, then need manage permission
      return authApp({ req, authToken: true, appId, per: ManagePermissionVal });
    } else {
      return authApp({ req, authToken: true, appId, per: WritePermissionVal });
    }
  })();

  // format nodes data
  // 1. dataset search limit, less than model quoteMaxToken
  const isDefaultPermissionChanged =
    defaultPermission !== undefined && defaultPermission !== app.defaultPermission;
  const isFolder = AppFolderTypeList.includes(app.type);

  const onUpdate = async (
    session?: ClientSession,
    updatedDefaultPermission?: PermissionValueType
  ) => {
    const { nodes: formatNodes } = beforeUpdateAppFormat({ nodes });

    return MongoApp.findByIdAndUpdate(
      appId,
      {
        ...parseParentIdInMongo(parentId),
        ...(name && { name }),
        ...(type && { type }),
        ...(avatar && { avatar }),
        ...(intro !== undefined && { intro }),
        // update default permission(Maybe move update)
        ...(updatedDefaultPermission !== undefined && {
          defaultPermission: updatedDefaultPermission
        }),
        // Not root, update default permission
        ...(app.parentId && isDefaultPermissionChanged && { inheritPermission: false }),
        ...(teamTags && { teamTags }),
        ...(formatNodes && {
          modules: formatNodes
        }),
        ...(edges && {
          edges
        }),
        ...(chatConfig && { chatConfig })
      },
      { session }
    );
  };

  // Move
  if (parentId !== undefined) {
    await mongoSessionRun(async (session) => {
      // Auth
      const parentDefaultPermission = await (async () => {
        if (parentId) {
          const { app: parentApp } = await authApp({
            req,
            authToken: true,
            appId: parentId,
            per: WritePermissionVal
          });

          return parentApp.defaultPermission;
        }

        return AppDefaultPermissionVal;
      })();

      // Inherit folder: Sync children permission and it's clbs
      if (isFolder && app.inheritPermission) {
        const parentClbs = await getResourceAllClbs({
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
          defaultPermission: parentDefaultPermission,
          collaborators: parentClbs,
          session
        });

        return onUpdate(session, parentDefaultPermission);
      }

      return onUpdate(session);
    });
  } else if (isDefaultPermissionChanged) {
    // Update default permission
    await mongoSessionRun(async (session) => {
      if (isFolder) {
        // Sync children default permission
        await syncChildrenPermission({
          resource: {
            _id: app._id,
            type: app.type,
            teamId: app.teamId,
            parentId: app.parentId
          },
          folderTypeList: AppFolderTypeList,
          resourceModel: MongoApp,
          resourceType: PerResourceTypeEnum.app,
          session,
          defaultPermission
        });
      } else if (app.inheritPermission && app.parentId) {
        // Inherit app
        const parentClbs = await getResourceAllClbs({
          teamId: app.teamId,
          resourceId: app.parentId,
          resourceType: PerResourceTypeEnum.app,
          session
        });
        await syncCollaborators({
          resourceId: app._id,
          resourceType: PerResourceTypeEnum.app,
          collaborators: parentClbs,
          session,
          teamId: app.teamId
        });
      }

      return onUpdate(session, defaultPermission);
    });
  } else {
    return onUpdate();
  }
}

export default NextAPI(handler);
