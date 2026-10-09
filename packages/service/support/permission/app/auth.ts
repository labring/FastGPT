/* Auth app permission */
import { MongoApp } from '../../../core/app/schema';
import { type AppWithPermissionType } from '@fastgpt/global/core/app/type';
import {
  PerResourceTypeEnum,
  ReadPermissionVal,
  ReadRoleVal
} from '@fastgpt/global/support/permission/constant';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { getTmbInfoByTmbId } from '../../user/team/controller';
import { getTmbPermission } from '../controller';
import { AppPermission } from '@fastgpt/global/support/permission/app/controller';
import { type PermissionValueType } from '@fastgpt/global/support/permission/type';
import { AppFolderTypeList, AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { type ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { type AuthModeType, type AuthResponseType } from '../type';
import {
  AppReadChatLogPerVal,
  AppReadChatLogRoleVal
} from '@fastgpt/global/support/permission/app/constant';
import { parseHeaderCert } from '../auth/common';
import { sumPer } from '@fastgpt/global/support/permission/utils';
import { shouldInheritResourcePermission } from '../resourcePermissionPolicy';

export const authWorkflowToolByTmbId = async ({
  tmbId,
  appId,
  per
}: {
  tmbId: string;
  appId: string;
  per: PermissionValueType;
}) => {
  const { app } = await authAppByTmbId({
    appId,
    tmbId,
    per
  });
  return app;
};

/**
 * 校验成员的应用权限并返回实际有效权限，供下游会话等资源继续鉴权。
 * hidden 应用允许同团队成员读取，但仅团队管理员拥有日志权限；返回权限不随本次请求权限变化。
 */
export const authAppByTmbId = async ({
  tmbId,
  appId,
  per,
  isRoot
}: {
  tmbId: string;
  appId: string;
  per: PermissionValueType;
  isRoot?: boolean;
}): Promise<{
  app: AppWithPermissionType;
}> => {
  const { teamId, permission: tmbPer } = await getTmbInfoByTmbId({ tmbId });

  const app = await (async () => {
    const app = await MongoApp.findOne({ _id: appId, deleteTime: null }).lean();

    if (!app) {
      return Promise.reject(AppErrEnum.unExist);
    }

    if (isRoot) {
      return {
        ...app,
        permission: new AppPermission({ isOwner: true })
      };
    }

    if (String(app.teamId) !== teamId) {
      return Promise.reject(AppErrEnum.unAuthApp);
    }

    if (app.type === AppTypeEnum.hidden) {
      if (per === AppReadChatLogPerVal) {
        if (!tmbPer.hasManagePer) {
          return Promise.reject(AppErrEnum.unAuthApp);
        }
      } else if (per !== ReadPermissionVal) {
        return Promise.reject(AppErrEnum.unAuthApp);
      }

      return {
        ...app,
        permission: new AppPermission({
          isOwner: false,
          // Read 调用也会消费日志权限位，不能向普通成员附带授予日志权限。
          role: tmbPer.hasManagePer ? sumPer(ReadRoleVal, AppReadChatLogRoleVal) : ReadRoleVal
        })
      };
    }

    const isOwner = tmbPer.isOwner || String(app.tmbId) === String(tmbId);

    const isGetParentClb =
      shouldInheritResourcePermission(app.inheritPermission) &&
      !AppFolderTypeList.includes(app.type) &&
      !!app.parentId;
    const [folderPer = 0, myPer = 0] = await Promise.all([
      isGetParentClb
        ? getTmbPermission({
            teamId,
            tmbId,
            resourceId: app.parentId!,
            resourceType: PerResourceTypeEnum.app
          })
        : 0,
      getTmbPermission({
        teamId,
        tmbId,
        resourceId: appId,
        resourceType: PerResourceTypeEnum.app
      })
    ]);

    const Per = new AppPermission({ role: sumPer(folderPer, myPer), isOwner });

    if (app.favourite || app.quick) {
      Per.addRole(ReadRoleVal);
    }

    if (!Per.checkPer(per)) {
      return Promise.reject(AppErrEnum.unAuthApp);
    }

    return {
      ...app,
      permission: Per
    };
  })();

  return { app };
};

export const authApp = async ({
  appId,
  per,
  ...props
}: AuthModeType & {
  appId: ParentIdType;
  per: PermissionValueType;
}): Promise<
  AuthResponseType<AppPermission> & {
    app: AppWithPermissionType;
  }
> => {
  const result = await parseHeaderCert(props);
  const { tmbId } = result;

  if (!appId) {
    return Promise.reject(AppErrEnum.unExist);
  }

  const { app } = await authAppByTmbId({
    tmbId,
    appId,
    per,
    isRoot: result.isRoot
  });

  return {
    ...result,
    permission: app.permission,
    app
  };
};
