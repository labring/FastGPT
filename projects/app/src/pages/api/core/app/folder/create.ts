import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import {
  OwnerPermissionVal,
  PerResourceTypeEnum,
  WritePermissionVal
} from '@fastgpt/global/support/permission/constant';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { FolderImgUrl } from '@fastgpt/global/common/file/image/constants';
import { NextAPI } from '@/service/middleware/entry';
import { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { parseParentIdInMongo } from '@fastgpt/global/common/parentFolder/utils';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { syncCollaborators } from '@fastgpt/service/support/permission/inheritPermission';
import { getResourceClbsAndGroups } from '@fastgpt/service/support/permission/controller';
import { TeamWritePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';

export type CreateAppFolderBody = {
  parentId?: ParentIdType;
  name: string;
  intro?: string;
};

async function handler(req: ApiRequestProps<CreateAppFolderBody>) {
  const { name, intro, parentId } = req.body;

  if (!name) {
    Promise.reject(CommonErrEnum.missingParams);
  }

  // 凭证校验
  const { teamId, tmbId } = await authUserPer({
    req,
    authToken: true,
    per: TeamWritePermissionVal
  });

  if (parentId) {
    // if it is not a root folder
    await authApp({
      req,
      appId: parentId,
      per: WritePermissionVal,
      authToken: true
    });
  }

  // Create app
  await mongoSessionRun(async (session) => {
    const app = await MongoApp.create({
      ...parseParentIdInMongo(parentId),
      avatar: FolderImgUrl,
      name,
      intro,
      teamId,
      tmbId,
      type: AppTypeEnum.folder
    });

    if (parentId) {
      const parentClbsAndGroups = await getResourceClbsAndGroups({
        teamId,
        resourceId: parentId,
        resourceType: PerResourceTypeEnum.app,
        session
      });

      await syncCollaborators({
        resourceType: PerResourceTypeEnum.app,
        teamId,
        resourceId: app._id,
        collaborators: parentClbsAndGroups,
        session
      });
    } else {
      // Create default permission
      await MongoResourcePermission.create(
        [
          {
            resourceType: PerResourceTypeEnum.app,
            teamId,
            resourceId: app._id,
            tmbId,
            permission: OwnerPermissionVal
          }
        ],
        {
          session
        }
      );
    }
  });
}

export default NextAPI(handler);
