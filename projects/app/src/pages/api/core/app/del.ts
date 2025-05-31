import type { NextApiRequest, NextApiResponse } from 'next';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { NextAPI } from '@/service/middleware/entry';
import { MongoChatInputGuide } from '@fastgpt/service/core/chat/inputGuide/schema';
import {
  OwnerPermissionVal,
  PerResourceTypeEnum
} from '@fastgpt/global/support/permission/constant';
import { findAppAndAllChildren } from '@fastgpt/service/core/app/controller';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { type ClientSession } from '@fastgpt/service/common/mongo';
import { deleteChatFiles } from '@fastgpt/service/core/chat/controller';
import { pushTrack } from '@fastgpt/service/common/middle/tracks/utils';
import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { removeImageByPath } from '@fastgpt/service/common/file/image/controller';
import { addOperationLog } from '@fastgpt/service/support/operationLog/addOperationLog';
import { OperationLogEventEnum } from '@fastgpt/global/support/operationLog/constants';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { getI18nAppType } from '@fastgpt/service/support/operationLog/util';
async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  const { appId } = req.query as { appId: string };

  if (!appId) {
    throw new Error('参数错误');
  }

  // Auth owner (folder owner, can delete all apps in the folder)
  const { teamId, tmbId, userId, app } = await authApp({
    req,
    authToken: true,
    appId,
    per: OwnerPermissionVal
  });

  await onDelOneApp({
    teamId,
    appId
  });
  (async () => {
    addOperationLog({
      tmbId,
      teamId,
      event: OperationLogEventEnum.DELETE_APP,
      params: {
        appName: app.name,
        appType: getI18nAppType(app.type)
      }
    });
  })();

  // Tracks
  pushTrack.countAppNodes({ teamId, tmbId, uid: userId, appId });
}

export default NextAPI(handler);

export const onDelOneApp = async ({
  teamId,
  appId,
  session
}: {
  teamId: string;
  appId: string;
  session?: ClientSession;
}) => {
  const apps = await findAppAndAllChildren({
    teamId,
    appId,
    fields: '_id avatar'
  });

  const del = async (session: ClientSession) => {
    for await (const app of apps) {
      const appId = app._id;
      // Chats
      await deleteChatFiles({ appId });
      await MongoChatItem.deleteMany(
        {
          appId
        },
        { session }
      );
      await MongoChat.deleteMany(
        {
          appId
        },
        { session }
      );

      // 删除分享链接
      await MongoOutLink.deleteMany({
        appId
      }).session(session);
      // Openapi
      await MongoOpenApi.deleteMany({
        appId
      }).session(session);

      // delete version
      await MongoAppVersion.deleteMany({
        appId
      }).session(session);

      await MongoChatInputGuide.deleteMany({
        appId
      }).session(session);

      await MongoResourcePermission.deleteMany({
        resourceType: PerResourceTypeEnum.app,
        teamId,
        resourceId: appId
      }).session(session);

      // delete app
      await MongoApp.deleteOne(
        {
          _id: appId
        },
        { session }
      );

      await removeImageByPath(app.avatar, session);
    }
  };

  if (session) {
    return del(session);
  }

  return mongoSessionRun(del);
};
