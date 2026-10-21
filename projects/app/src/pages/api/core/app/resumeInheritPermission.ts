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

  // 审计展示需要完整资源路径；只查询直接父级会在嵌套目录下丢失祖先。
  const parentResourceNames = await (async function findParentNames(
    parentId: typeof app.parentId
  ): Promise<string[]> {
    if (!parentId) return [];

    const parent = await MongoApp.findById(parentId, 'name parentId').lean();
    if (!parent) return [];

    return [...(await findParentNames(parent.parentId)), parent.name];
  })(app.parentId);
  const parentResourceName = parentResourceNames.at(-1);

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
    params: {
      targetResource: [...parentResourceNames, app.name].join('/'),
      parentResource: parentResourceName ?? '-'
    }
  });

  return ResumeInheritPermissionResponseSchema.parse(undefined);
}
export default NextAPI(handler);
