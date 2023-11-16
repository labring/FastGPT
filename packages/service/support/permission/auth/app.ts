import { MongoApp } from '../../../core/app/schema';
import { AppDetailType } from '@fastgpt/global/core/app/type.d';
import { AuthModeType } from '../type';
import { AuthResponseType } from '@fastgpt/global/support/permission/type';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';
import { parseHeaderCert } from '../controller';
import { PermissionTypeEnum } from '@fastgpt/global/support/permission/constant';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { getTeamInfoByTmbId } from '../../user/team/controller';

// 模型使用权校验
export async function authApp({
  appId,
  per = 'owner',
  ...props
}: AuthModeType & {
  appId: string;
}): Promise<
  AuthResponseType & {
    teamOwner: boolean;
    app: AppDetailType;
  }
> {
  const result = await parseHeaderCert(props);
  const { teamId, tmbId } = result;
  const { role } = await getTeamInfoByTmbId({ tmbId });

  const { app, isOwner, canWrite } = await (async () => {
    // get app
    const app = await MongoApp.findOne({ _id: appId, teamId }).lean();
    if (!app) {
      return Promise.reject(AppErrEnum.unAuthApp);
    }

    const isOwner =
      role !== TeamMemberRoleEnum.visitor &&
      (String(app.tmbId) === tmbId || role === TeamMemberRoleEnum.owner);
    const canWrite =
      isOwner ||
      (app.permission === PermissionTypeEnum.public && role !== TeamMemberRoleEnum.visitor);

    if (per === 'r') {
      if (!isOwner && app.permission !== PermissionTypeEnum.public) {
        return Promise.reject(AppErrEnum.unAuthApp);
      }
    }
    if (per === 'w' && !canWrite) {
      return Promise.reject(AppErrEnum.unAuthApp);
    }
    if (per === 'owner' && !isOwner) {
      return Promise.reject(AppErrEnum.unAuthApp);
    }

    return {
      app: {
        ...app,
        isOwner,
        canWrite
      },
      isOwner,
      canWrite
    };
  })();

  return {
    ...result,
    app,
    isOwner,
    canWrite,
    teamOwner: role === TeamMemberRoleEnum.owner
  };
}
