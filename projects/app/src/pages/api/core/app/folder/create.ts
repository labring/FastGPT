import { NextAPI } from '@/service/middleware/entry';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { FolderImgUrl } from '@fastgpt/global/common/file/image/constants';
import { type ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { parseParentIdInMongo } from '@fastgpt/global/common/parentFolder/utils';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import {
  PerResourceTypeEnum,
  WritePermissionVal
} from '@fastgpt/global/support/permission/constant';
import { TeamAppCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { createResourceDefaultCollaborators } from '@fastgpt/service/support/permission/controller';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { checkTeamAppTypeLimit } from '@fastgpt/service/support/permission/teamLimit';
export type CreateAppFolderBody = {
  parentId?: ParentIdType;
  name: string;
  intro?: string;
  type: AppTypeEnum.folder | AppTypeEnum.toolFolder;
};

async function handler(req: ApiRequestProps<CreateAppFolderBody>) {
  const { name, intro, parentId, type } = req.body;

  if (!name || !type) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  if (type !== AppTypeEnum.folder && type !== AppTypeEnum.toolFolder) {
    return Promise.reject(CommonErrEnum.invalidParams);
  }

  // 凭证校验
  const { teamId, tmbId } = parentId
    ? await authApp({ req, appId: parentId, per: WritePermissionVal, authToken: true })
    : await authUserPer({ req, authToken: true, per: TeamAppCreatePermissionVal });

  await checkTeamAppTypeLimit({ teamId, appCheckType: 'folder' });

  // Create app
  await mongoSessionRun(async (session) => {
    const app = await MongoApp.create({
      ...parseParentIdInMongo(parentId),
      avatar: FolderImgUrl,
      name,
      intro,
      teamId,
      tmbId,
      type
    });

    await createResourceDefaultCollaborators({
      tmbId,
      session,
      resource: app,
      resourceType: PerResourceTypeEnum.app
    });
  });
  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.CREATE_APP_FOLDER,
      params: {
        folderName: name
      }
    });
  })();
}

export default NextAPI(handler);
