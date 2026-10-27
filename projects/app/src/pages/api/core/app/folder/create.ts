import { NextAPI } from '@/service/middleware/entry';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { FolderImgUrl } from '@fastgpt/global/common/file/image/constants';
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
import { type ApiRequestProps } from '@fastgpt/next/type';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { checkTeamAppTypeLimit } from '@fastgpt/service/support/permission/teamLimit';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { checkCreateFolderDepth } from '@fastgpt/service/common/parentFolder/depth';
import { getFolderAncestorIdsFromParentId } from '@fastgpt/service/common/parentFolder/ancestorIds';
import { validateParentFolderType } from '@fastgpt/service/core/app/folderTree';
import {
  CreateAppFolderBodySchema,
  type CreateAppFolderBodyType
} from '@fastgpt/global/openapi/core/app/folder/api';

async function handler(req: ApiRequestProps<CreateAppFolderBodyType>): Promise<void> {
  const {
    name,
    intro,
    parentId,
    type,
    inheritPermission = true
  } = parseApiInput({
    req,
    bodySchema: CreateAppFolderBodySchema
  }).body;

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

  // 普通文件夹与工具文件夹是两棵独立的树，父文件夹类型必须与新建文件夹一致。
  await validateParentFolderType({ parentId, childType: type });

  await checkCreateFolderDepth({ parentId, teamId, model: MongoApp });

  // Create app
  await mongoSessionRun(async (session) => {
    // parentId 是权威来源，兼容尚未完成回填的历史目录。
    const ancestorIds = await getFolderAncestorIdsFromParentId({
      parentId: parentId ? String(parentId) : null,
      findFolder: (id) =>
        MongoApp.findOne({ _id: id, teamId, type }).select('_id parentId').session(session).lean()
    });

    const [app] = await MongoApp.create(
      [
        {
          ...parseParentIdInMongo(parentId),
          ancestorIds,
          avatar: FolderImgUrl,
          name,
          intro,
          teamId,
          tmbId,
          type,
          // 独立态只写创建者 ACL，不合并父文件夹权限；未传时保持历史默认继承。
          inheritPermission
        }
      ],
      { session }
    );

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
