/* Auth app permission */
import { MongoApp } from '../../../core/app/schema';
import { AppDetailType, AppSchema } from '@fastgpt/global/core/app/type.d';
import { AuthPropsType } from '../type/auth.d';
import { parseHeaderCert } from '../controller';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { getTmbInfoByTmbId } from '../../user/team/controller';
import { getResourcePermission } from '../controller';
import { AppPermission } from '@fastgpt/global/support/permission/app/controller';
import { AuthResponseType } from '../type/auth.d';
import { PermissionValueType } from '@fastgpt/global/support/permission/type';
import { AppFolderTypeList } from '@fastgpt/global/core/app/constants';
import { ParentIdType } from '@fastgpt/global/common/parentFolder/type';

export const authAppByTmbId = async ({
  tmbId,
  appId,
  per
}: {
  tmbId: string;
  appId: string;
  per: PermissionValueType;
}): Promise<{
  app: AppDetailType;
}> => {
  const { teamId, permission: tmbPer } = await getTmbInfoByTmbId({ tmbId });

  const app = await (async () => {
    const app = await MongoApp.findOne({ _id: appId }).lean();

    if (!app) {
      return Promise.reject(AppErrEnum.unExist);
    }
    const isOwner = tmbPer.isOwner || String(app.tmbId) === String(tmbId);

    const Per = await (async () => {
      if (
        AppFolderTypeList.includes(app.type) ||
        app.inheritPermission === false ||
        !app.parentId
      ) {
        // 1. is a folder. (Folders have compeletely permission)
        // 2. inheritPermission is false.
        // 3. is root folder/app.
        const rp = await getResourcePermission({
          teamId,
          tmbId,
          resourceId: appId,
          resourceType: PerResourceTypeEnum.app
        });
        const Per = new AppPermission({ per: rp?.permission ?? app.defaultPermission, isOwner });
        if (!Per.checkPer(per)) {
          return Promise.reject(AppErrEnum.unAuthApp);
        }
        return Per;
      } else {
        // is not folder and inheritPermission is true and is not root folder.
        const { app: parent } = await authAppByTmbId({
          tmbId,
          appId: app.parentId.toString(),
          per
        });

        const Per = new AppPermission({
          per: parent.permission.value,
          isOwner
        });

        if (!Per.checkPer(per)) {
          return Promise.reject(AppErrEnum.unAuthApp);
        }
        return Per;
      }
    })();

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
}: AuthPropsType & {
  appId: string | ParentIdType;
}): Promise<
  AuthResponseType & {
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
    per
  });

  return {
    ...result,
    permission: app.permission,
    app
  };
};
