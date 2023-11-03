import { MongoApp } from '../../../core/app/schema';
import { AppDetailType, AppSchema } from '@fastgpt/global/core/app/type.d';
import { AuthModeType } from '../type';
import { AuthResponseType } from '@fastgpt/global/support/permission/type';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';
import { parseHeaderAuth } from '../controller';
import { PermissionTypeEnum } from '@fastgpt/global/support/permission/constant';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';

// 模型使用权校验
export async function authApp({
  appId,
  role,
  per = 'owner',
  ...props
}: AuthModeType & {
  appId: string;
  role: `${TeamMemberRoleEnum}`;
}): Promise<
  AuthResponseType & {
    app: AppDetailType;
  }
> {
  const { userId, teamId, tmbId } = await parseHeaderAuth(props);

  const { app, isOwner, canWrite } = await (async () => {
    // get app
    const app = (await MongoApp.findById(appId))?.toJSON();
    if (!app) {
      return Promise.reject('App is not exists');
    }

    const isOwner = String(app.tmbId) === tmbId;
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
    userId,
    teamId,
    tmbId,
    app,
    isOwner,
    canWrite
  };
}
