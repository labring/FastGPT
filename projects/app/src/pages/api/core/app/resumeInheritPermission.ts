import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import {
  ManagePermissionVal,
  PerResourceTypeEnum
} from '@fastgpt/global/support/permission/constant';
import { resumeInheritPermission } from '@fastgpt/service/support/permission/inheritPermission';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { AppFolderTypeList } from '@fastgpt/global/core/app/constants';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  ResumeInheritPermissionQuerySchema,
  ResumeInheritPermissionResponseSchema,
  type ResumeInheritPermissionBodyType,
  type ResumeInheritPermissionQueryType,
  type ResumeInheritPermissionResponseType
} from '@fastgpt/global/openapi/core/app/permission/api';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

// resume the app's inherit permission.
async function handler(
  req: ApiRequestProps<ResumeInheritPermissionBodyType, ResumeInheritPermissionQueryType>
): Promise<ResumeInheritPermissionResponseType> {
  const { appId } = parseApiInput({
    req,
    querySchema: ResumeInheritPermissionQuerySchema
  }).query;
  const { teamId, tmbId, app } = await authApp({
    appId,
    req,
    authToken: true,
    per: ManagePermissionVal
  });

  let affectedResourceCount = 1;
  if (app.parentId) {
    affectedResourceCount = await resumeInheritPermission({
      resource: app,
      folderTypeList: AppFolderTypeList,
      resourceType: PerResourceTypeEnum.app,
      resourceModel: MongoApp
    });
  } else {
    await MongoApp.updateOne(
      {
        _id: appId
      },
      {
        inheritPermission: true
      }
    );
  }

  await addAuditLog({
    teamId,
    tmbId,
    scope: 'member',
    event: AuditEventEnum.RESUME_INHERIT_PERMISSION,
    params: {
      datasetId: appId,
      datasetName: app.name,
      targetPath: app.name,
      parentDatasetName: app.parentId ? String(app.parentId) : '-',
      oldPermissionSource: 'self',
      newPermissionSource: app.parentId ? 'parent' : 'team',
      affectedResourceCount
    }
  });

  return ResumeInheritPermissionResponseSchema.parse(undefined);
}
export default NextAPI(handler);
