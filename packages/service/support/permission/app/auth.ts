/* Auth app permission */
import { MongoApp } from '../../../core/app/schema';
import { AppDetailType } from '@fastgpt/global/core/app/type.d';
import { AuthPropsType } from '../type/auth.d';
import { parseHeaderCert } from '../controller';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { getTmbInfoByTmbId } from '../../user/team/controller';
import { getResourcePermission } from '../controller';
import { AppPermission } from '@fastgpt/global/support/permission/app/controller';
import { AuthResponseType } from '../type/auth.d';
import { PermissionValueType } from '@fastgpt/global/support/permission/type';

export const authAppByTmbId = async ({
  teamId,
  tmbId,
  appId,
  per
}: {
  teamId: string;
  tmbId: string;
  appId: string;
  per: PermissionValueType;
}) => {
  const { permission: tmbPer } = await getTmbInfoByTmbId({ tmbId });

  const app = await (async () => {
    // get app and per
    const [app, rp] = await Promise.all([
      MongoApp.findOne({ _id: appId, teamId }).lean(),
      getResourcePermission({
        teamId,
        tmbId,
        resourceId: appId,
        resourceType: PerResourceTypeEnum.app
      }) // this could be null
    ]);

    if (!app) {
      return Promise.reject(AppErrEnum.unExist);
    }

    const isOwner = tmbPer.isOwner || String(app.tmbId) === tmbId;
    const Per = new AppPermission({ per: rp?.permission ?? app.defaultPermission, isOwner });

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
}: AuthPropsType & {
  appId: string;
}): Promise<
  AuthResponseType & {
    app: AppDetailType;
  }
> => {
  const result = await parseHeaderCert(props);
  const { teamId, tmbId } = result;

  const { app } = await authAppByTmbId({
    teamId,
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
