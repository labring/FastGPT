import { AppFolderTypeList, AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { checkTeamAppLimit } from '@fastgpt/service/support/permission/teamLimit';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import type { AppSchema } from '@fastgpt/global/core/app/type';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { parseParentIdInMongo } from '@fastgpt/global/common/parentFolder/utils';
import { defaultNodeVersion } from '@fastgpt/global/core/workflow/node/constant';
import { ClientSession } from '@fastgpt/service/common/mongo';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { pushTrack } from '@fastgpt/service/common/middle/tracks/utils';
import { refreshSourceAvatar } from '@fastgpt/service/common/file/image/controller';

export type CreateAppBody = {
  parentId?: ParentIdType;
  name?: string;
  avatar?: string;
  type?: AppTypeEnum;
  modules: AppSchema['modules'];
  edges?: AppSchema['edges'];
  chatConfig?: AppSchema['chatConfig'];
};

async function handler(req: ApiRequestProps<CreateAppBody>) {
  const { parentId, name, avatar, type, modules, edges, chatConfig } = req.body;

  if (!name || !type || !Array.isArray(modules)) {
    return Promise.reject(CommonErrEnum.inheritPermissionError);
  }

  // 凭证校验
  const [{ teamId, tmbId, userId }] = await Promise.all([
    authUserPer({ req, authToken: true, per: WritePermissionVal }),
    ...(parentId
      ? [authApp({ req, appId: parentId, per: WritePermissionVal, authToken: true })]
      : [])
  ]);

  // 上限校验
  await checkTeamAppLimit(teamId);
  const tmb = await MongoTeamMember.findById({ _id: tmbId }, 'userId').populate<{
    user: { avatar: string; username: string };
  }>('user', 'avatar username');

  // 创建app
  const appId = await onCreateApp({
    parentId,
    name,
    avatar,
    type,
    modules,
    edges,
    chatConfig,
    teamId,
    tmbId,
    userAvatar: tmb?.user?.avatar,
    username: tmb?.user?.username
  });

  pushTrack.createApp({
    type,
    uid: userId,
    teamId,
    tmbId
  });

  return appId;
}

export default NextAPI(handler);

export const onCreateApp = async ({
  parentId,
  name,
  intro,
  avatar,
  type,
  modules,
  edges,
  chatConfig,
  teamId,
  tmbId,
  pluginData,
  username,
  userAvatar,
  session
}: {
  parentId?: ParentIdType;
  name?: string;
  avatar?: string;
  type?: AppTypeEnum;
  modules?: AppSchema['modules'];
  edges?: AppSchema['edges'];
  chatConfig?: AppSchema['chatConfig'];
  intro?: string;
  teamId: string;
  tmbId: string;
  pluginData?: AppSchema['pluginData'];
  username?: string;
  userAvatar?: string;
  session?: ClientSession;
}) => {
  const create = async (session: ClientSession) => {
    const [{ _id: appId }] = await MongoApp.create(
      [
        {
          ...parseParentIdInMongo(parentId),
          avatar,
          name,
          intro,
          teamId,
          tmbId,
          modules,
          edges,
          chatConfig,
          type,
          version: 'v2',
          pluginData,
          'pluginData.nodeVersion': defaultNodeVersion
        }
      ],
      { session }
    );

    if (!AppFolderTypeList.includes(type!)) {
      await MongoAppVersion.create(
        [
          {
            tmbId,
            appId,
            nodes: modules,
            edges,
            chatConfig,
            versionName: name,
            username,
            avatar: userAvatar,
            isPublish: true
          }
        ],
        { session }
      );
    }

    await refreshSourceAvatar(avatar, undefined, session);

    return appId;
  };

  if (session) {
    return create(session);
  } else {
    return await mongoSessionRun(create);
  }
};
