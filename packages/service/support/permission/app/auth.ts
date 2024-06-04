import { MongoApp } from '../../../core/app/schema';
import { AppDetailType } from '@fastgpt/global/core/app/type.d';
import { AuthPropsType } from '../type';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';
import { parseHeaderCert } from '../controller';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { getTmbInfoByTmbId } from '../../user/team/controller';
import { getResourcePermission } from '../controller';
import { AppPermission } from '@fastgpt/global/support/permission/app/controller';
import { AuthResponseType } from '@fastgpt/global/support/permission/type/auth.d';

// 模型使用权校验
export async function authApp({
  appId,
  per,
  ...props
}: AuthPropsType & {
  appId: string;
}): Promise<
  AuthResponseType & {
    app: AppDetailType;
  }
> {
  const result = await parseHeaderCert(props);
  const { teamId, tmbId } = result;
  const { role } = await getTmbInfoByTmbId({ tmbId });

  const rp = await getResourcePermission({
    teamId,
    tmbId,
    resourceId: appId,
    resourceType: PerResourceTypeEnum.app
  }); // this could be null

  const app = await (async () => {
    // get app
    const app = await MongoApp.findOne({ _id: appId, teamId }).lean();

    if (!app) {
      return Promise.reject(AppErrEnum.unExist);
    }

    const isOwner = role === 'owner' || String(app.tmbId) === tmbId;
    const Per = new AppPermission({ per: rp?.permission ?? app.defaultPermission, isOwner });

    if (!Per.checkPer(per)) {
      return Promise.reject(AppErrEnum.unAuthApp);
    }

    return {
      ...app,
      permission: Per
    };
  })();

  return {
    ...result,
    permission: app.permission,
    app
  };
}
