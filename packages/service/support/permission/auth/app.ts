import { MongoApp } from '../../../core/app/schema';
import { AppDetailType } from '@fastgpt/global/core/app/type.d';
import { AuthModeType } from '../type';
import { AuthResponseType } from '@fastgpt/global/support/permission/type';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';
import { parseHeaderCert } from '../controller';
import { ResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { getTmbInfoByTmbId } from '../../user/team/controller';
import { getResourcePermission } from '../resourcePermission/controller';
import { NullPermission, hasRead, hasWrite } from '../resourcePermission/permisson';
import { AppOwnerPermission } from '../app/permission';

// 模型使用权校验
export async function authApp({
  appId,
  per,
  ...props
}: AuthModeType & {
  appId: string;
}): Promise<
  AuthResponseType & {
    teamOwner: boolean;
    app: AppDetailType;
    role: `${TeamMemberRoleEnum}`;
  }
> {
  const result = await parseHeaderCert(props);
  const { teamId, tmbId } = result;
  const { role } = await getTmbInfoByTmbId({ tmbId });

  const rp = await getResourcePermission({
    tmbId,
    resourceId: appId,
    resourceType: ResourceTypeEnum.app
  }); // this could be null

  let permission;

  const { app, isOwner, canWrite } = await (async () => {
    // get app
    const app = await MongoApp.findOne({ _id: appId, teamId }).lean();

    if (rp) {
      permission = rp.permission;
    } else {
      permission = app?.defaultPermission;
    }

    if (!app) {
      return Promise.reject(AppErrEnum.unExist);
    }

    const isOwner = String(app.tmbId) === tmbId;
    if (isOwner) {
      permission = AppOwnerPermission.value;
    }

    const canWrite = isOwner || hasWrite(permission);

    if (!permission && !isOwner) {
      // if there is no permission and the user is not the owner,
      // the user is not the collaborator of the app
      return Promise.reject(AppErrEnum.unAuthApp);
    }

    if (per === 'r') {
      if (!isOwner && !hasRead(permission)) {
        return Promise.reject(AppErrEnum.unAuthApp);
      }
    }
    if (per === 'w' && !hasWrite(permission)) {
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
    role,
    isOwner,
    canWrite,
    teamOwner: role === TeamMemberRoleEnum.owner
  };
}
