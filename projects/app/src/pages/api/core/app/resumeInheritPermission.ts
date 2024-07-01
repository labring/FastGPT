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
export type ResumeInheritPermissionQuery = {
  appId: string;
};
export type ResumeInheritPermissionBody = {};
// resume the app's inherit permission.
async function handler(
  req: ApiRequestProps<ResumeInheritPermissionBody, ResumeInheritPermissionQuery>
) {
  const { appId } = req.query;
  const { app } = await authApp({
    appId,
    req,
    authToken: true,
    per: ManagePermissionVal
  });
  await resumeInheritPermission({
    resource: app,
    folderTypeList: AppFolderTypeList,
    resourceType: PerResourceTypeEnum.app,
    resourceModel: MongoApp,
    parentResource: app
  });
}
export default NextAPI(handler);
