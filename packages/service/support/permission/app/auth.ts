/* Auth app permission */
import { MongoApp } from '../../../core/app/schema';
import { type AppDetailType } from '@fastgpt/global/core/app/type.d';
import {
  NullRoleVal,
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
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';
import { type AuthModeType, type AuthResponseType } from '../type';
import { splitCombineToolId } from '@fastgpt/global/core/app/tool/utils';
import { AppReadChatLogPerVal } from '@fastgpt/global/support/permission/app/constant';
import { parseHeaderCert } from '../auth/common';
import { sumPer } from '@fastgpt/global/support/permission/utils';

export const authPluginByTmbId = async ({
  tmbId,
  appId,
  per
}: {
  tmbId: string;
  appId: string;
  per: PermissionValueType;
}) => {
  const { source } = splitCombineToolId(appId);
  if (source === AppToolSourceEnum.personal) {
    const { app } = await authAppByTmbId({
      appId,
      tmbId,
      per
    });

    return app;
  }
};

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
  app: AppDetailType;
}> => {
  const { teamId, permission: tmbPer } = await getTmbInfoByTmbId({ tmbId });

  const app = await (async () => {
    const app = await MongoApp.findOne({ _id: appId }).lean();

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
        permission: new AppPermission({ isOwner: false, role: ReadRoleVal })
      };
    }

    const isOwner = tmbPer.isOwner || String(app.tmbId) === String(tmbId);

    const isGetParentClb =
      app.inheritPermission && !AppFolderTypeList.includes(app.type) && !!app.parentId;

    const [folderPer = NullRoleVal, myPer = NullRoleVal] = await Promise.all([
      isGetParentClb
        ? getTmbPermission({
            teamId,
            tmbId,
            resourceId: app.parentId!,
            resourceType: PerResourceTypeEnum.app
          })
        : NullRoleVal,
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
    app: AppDetailType;
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
