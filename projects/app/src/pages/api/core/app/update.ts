import { MongoApp } from '@fastgpt/service/core/app/schema';
import type { AppUpdateParams } from '@/global/core/app/api';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { beforeUpdateAppFormat } from '@fastgpt/service/core/app/controller';
import { NextAPI } from '@/service/middleware/entry';
import {
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

  const { app } = await authApp({ req, authToken: true, appId, per: WritePermissionVal });

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
        ...(chatConfig && { chatConfig })
      },
      { session }
    );
  };

  // Move
  if (parentId !== undefined) {
    await mongoSessionRun(async (session) => {
      // Inherit folder: Sync children permission and it's clbs
      if (isFolder && app.inheritPermission) {
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

        return onUpdate(session);
      }

      return onUpdate(session);
    });
  } else {
    return onUpdate();
  }
}

export default NextAPI(handler);
