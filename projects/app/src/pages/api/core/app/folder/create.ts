import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import {
  PerResourceTypeEnum,
  WritePermissionVal
} from '@fastgpt/global/support/permission/constant';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { FolderImgUrl } from '@fastgpt/global/common/file/image/constants';
import { NextAPI } from '@/service/middleware/entry';
import { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { parseParentIdInMongo } from '@fastgpt/global/common/parentFolder/utils';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { AppDefaultPermissionVal } from '@fastgpt/global/support/permission/app/constant';
import { AppDetailType } from '@fastgpt/global/core/app/type';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';

export type CreateAppFolderBody = {
  parentId?: ParentIdType;
  name: string;
  intro?: string;
};

async function handler(req: ApiRequestProps<CreateAppFolderBody>) {
  const { name, intro, parentId } = req.body;

  if (!name) {
    Promise.reject(AppErrEnum.missingParams);
  }

  // 凭证校验
  const { teamId, tmbId } = await authUserPer({ req, authToken: true, per: WritePermissionVal });
  let parentApp: AppDetailType | null = null;
  if (parentId) {
    // if it is not a root folder
    const result = await authApp({ req, appId: parentId, per: WritePermissionVal }); // check the parent folder permission
    parentApp = result.app;
  }

  // Create app
  mongoSessionRun(async (session) => {
    const app = await MongoApp.create({
      ...parseParentIdInMongo(parentId),
      avatar: FolderImgUrl,
      name,
      intro,
      teamId,
      tmbId,
      type: AppTypeEnum.folder,
      inheritPermission: parentId ? true : false,
      defaultPermission: parentId ? parentApp!.defaultPermission : AppDefaultPermissionVal
    });

    // Create resource permission
    if (parentId) {
      const rp = await MongoResourcePermission.find({
        resourceId: parentId,
        teamId: teamId,
        resourceType: PerResourceTypeEnum.app
      }).lean();

      MongoResourcePermission.create(
        rp.map((item) => {
          return {
            teamId: teamId,
            resourceId: app._id.toString(),
            resourceType: PerResourceTypeEnum.app,
            permission: item.permission,
            tmbId: item.tmbId
          };
        }),
        { session }
      );
    }
  });
}

export default NextAPI(handler);
