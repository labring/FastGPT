import type { ApiRequestProps } from '@fastgpt/service/type/next';
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

// resume the app's inherit permission.
async function handler(
  req: ApiRequestProps<ResumeInheritPermissionBodyType, ResumeInheritPermissionQueryType>
): Promise<ResumeInheritPermissionResponseType> {
  const { appId } = parseApiInput({
    req,
    querySchema: ResumeInheritPermissionQuerySchema
  }).query;
  const { app } = await authApp({
    appId,
    req,
    authToken: true,
    per: ManagePermissionVal
  });

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

  return ResumeInheritPermissionResponseSchema.parse(undefined);
}
export default NextAPI(handler);
