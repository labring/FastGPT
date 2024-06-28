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
  getParentCollaborators,
  syncChildrenPermission,
  updateCollaborators
} from '@fastgpt/service/support/permission/inheritPermission';
import { AppFolderTypeList } from '@fastgpt/global/core/app/constants';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ClientSession } from 'mongoose';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { PermissionValueType } from '@fastgpt/global/support/permission/type';
import { AppDefaultPermissionVal } from '@fastgpt/global/support/permission/app/constant';

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

  const app = await (async () => {
    if (defaultPermission) {
      // if defaultPermission or inheritPermission is set, then need manage permission
      return (await authApp({ req, authToken: true, appId, per: ManagePermissionVal })).app;
    } else {
      return (await authApp({ req, authToken: true, appId, per: WritePermissionVal })).app;
    }
  })();

  // format nodes data
  // 1. dataset search limit, less than model quoteMaxToken
  const { nodes: formatNodes } = beforeUpdateAppFormat({ nodes });
  const isDefaultPermissionChanged =
    defaultPermission !== undefined && defaultPermission !== app.defaultPermission;

  const onUpdate = async (
    session?: ClientSession,
    defaultPermissionFromParent?: PermissionValueType
  ) => {
    return await MongoApp.findByIdAndUpdate(
      appId,
      {
        ...parseParentIdInMongo(parentId),
        ...(name && { name }),
        ...(type && { type }),
        ...(avatar && { avatar }),
        ...(intro !== undefined && { intro }),
        ...(defaultPermission !== undefined && { defaultPermission }),
        ...(isDefaultPermissionChanged && { inheritPermission: false }),
        ...(defaultPermissionFromParent && { defaultPermission: defaultPermissionFromParent }),
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

  mongoSessionRun(async (session) => {
    if (isDefaultPermissionChanged) {
      // is inherit permission is disabled. we need to sync the permission
      // 1. update the app's collaborator
      const parentCollaborators = await getParentCollaborators({
        resource: app,
        resourceType: PerResourceTypeEnum.app,
        session
      });
      await updateCollaborators({
        resourceId: app._id,
        resourceType: PerResourceTypeEnum.app,
        collaborators: parentCollaborators,
        session,
        teamId: app.teamId
      });
      // 2. sync the children
      await syncChildrenPermission({
        resource: {
          ...app,
          defaultPermission
        },
        resourceType: PerResourceTypeEnum.app,
        resourceModel: MongoApp,
        folderTypeList: AppFolderTypeList,
        collaborators: parentCollaborators,
        session
      });
    }
    const defaultPermissionFromParent = await (async () => {
      const isMove = parentId !== undefined; // if not provided, then not move
      const isMoveToRoot = isMove && !parentId; // if move and parentId is null, then move to root
      if (isMove) {
        if (AppFolderTypeList.includes(app.type) && app.inheritPermission) {
          // 1. authorization
          const parentFolder = await (async () => {
            if (isMoveToRoot) {
              // if move, auth the parent folder
              // if move to root, then no need to auth the parent folder. Auth the user instead
              await authUserPer({ req, authToken: true, per: WritePermissionVal });
              return;
            } else {
              return (
                await authApp({
                  req,
                  authToken: true,
                  appId: parentId,
                  per: WritePermissionVal
                })
              ).app;
            }
          })();
          // 2. sync it self
          // 2.1 get parent
          const defaultPermission = isMoveToRoot
            ? AppDefaultPermissionVal
            : parentFolder!.defaultPermission;

          const collaborators = isMoveToRoot
            ? []
            : await getParentCollaborators({
                resource: app,
                resourceType: PerResourceTypeEnum.app,
                session
              });
          // 2.2 edit it self
          // HINT: The defaultPermission will be return to the onUpdate function for avoiding the Write Conflict
          await updateCollaborators({
            resourceId: app._id,
            resourceType: PerResourceTypeEnum.app,
            collaborators,
            session,
            teamId: app.teamId
          });

          // 3. sync its children
          await syncChildrenPermission({
            resource: {
              ...app,
              defaultPermission: defaultPermission ?? AppDefaultPermissionVal
            },
            resourceType: PerResourceTypeEnum.app,
            resourceModel: MongoApp,
            folderTypeList: AppFolderTypeList,
            collaborators,
            session
          });
          return defaultPermission;
        }
      }
    })();
    await onUpdate(session, defaultPermissionFromParent);
  });
}

export default NextAPI(handler);
