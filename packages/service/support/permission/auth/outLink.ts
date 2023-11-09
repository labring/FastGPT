import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';
import { AuthModeType } from '../type';
import { AuthResponseType } from '@fastgpt/global/support/permission/type';
import { AppDetailType } from '@fastgpt/global/core/app/type';
import { OutLinkSchema } from '@fastgpt/global/support/outLink/type';
import { parseHeaderCert } from '../controller';
import { MongoOutLink } from '../../outLink/schema';
import { MongoApp } from '../../../core/app/schema';
import { OutLinkErrEnum } from '@fastgpt/global/common/error/code/outLink';
import { PermissionTypeEnum } from '@fastgpt/global/support/permission/constant';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { getTeamInfoByTmbId } from '../../user/team/controller';

/* crud outlink permission */
export async function authOutLinkCrud({
  outLinkId,
  per = 'owner',
  ...props
}: AuthModeType & {
  outLinkId: string;
}): Promise<
  AuthResponseType & {
    app: AppDetailType;
    outLink: OutLinkSchema;
  }
> {
  const result = await parseHeaderCert(props);
  const { tmbId, teamId } = result;

  const { role } = await getTeamInfoByTmbId({ tmbId });

  const { app, outLink, isOwner, canWrite } = await (async () => {
    const outLink = await MongoOutLink.findOne({ _id: outLinkId, teamId });

    if (!outLink) {
      throw new Error(OutLinkErrEnum.unExist);
    }

    const app = await MongoApp.findById(outLink.appId);

    if (!app) {
      return Promise.reject(AppErrEnum.unExist);
    }

    const isOwner = String(outLink.tmbId) === tmbId || role === TeamMemberRoleEnum.owner;
    const canWrite =
      isOwner ||
      (app.permission === PermissionTypeEnum.public && role !== TeamMemberRoleEnum.visitor);

    if (per === 'r' && !isOwner && app.permission !== PermissionTypeEnum.public) {
      return Promise.reject(OutLinkErrEnum.unAuthLink);
    }
    if (per === 'w' && !canWrite) {
      return Promise.reject(OutLinkErrEnum.unAuthLink);
    }
    if (per === 'owner' && !isOwner) {
      return Promise.reject(OutLinkErrEnum.unAuthLink);
    }

    return {
      app: {
        ...app,
        isOwner: String(app.tmbId) === tmbId,
        canWrite
      },
      outLink,
      isOwner,
      canWrite
    };
  })();

  return {
    ...result,
    app,
    outLink,
    isOwner,
    canWrite
  };
}

export async function authOutLinkValid({ shareId }: { shareId?: string }) {
  const shareChat = await MongoOutLink.findOne({ shareId });

  if (!shareChat) {
    return Promise.reject(OutLinkErrEnum.linkUnInvalid);
  }

  const app = await MongoApp.findById(shareChat.appId);

  if (!app) {
    return Promise.reject(AppErrEnum.unExist);
  }

  return {
    app,
    shareChat
  };
}
