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
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import {
  ResumeInheritPermissionQuerySchema,
  ResumeInheritPermissionResponseSchema,
  type ResumeInheritPermissionBodyType,
  type ResumeInheritPermissionQueryType,
  type ResumeInheritPermissionResponseType
} from '@fastgpt/global/openapi/core/app/permission/api';

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

  const parentApp = app.parentId ? await MongoApp.findById(app.parentId, 'name').lean() : undefined;
  const parentResourceName = parentApp?.name;
  if (app.parentId) {
    await resumeInheritPermission({
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

  addAuditLog({
    teamId,
    tmbId,
    event: AuditEventEnum.RESUME_INHERIT_PERMISSION,
    resources: [{ appId: String(app._id) }],
    params: {
      targetResource: app.name,
      ...(parentResourceName !== undefined ? { parentResource: parentResourceName } : {})
    }
  });

  return ResumeInheritPermissionResponseSchema.parse(undefined);
}
export default NextAPI(handler);
