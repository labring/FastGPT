import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';

export type UpdateChatVisibilityConfigBody = {
  appId: string;
  showNodeStatus?: boolean;
  responseDetail?: boolean;
  showFullText?: boolean;
  showRawSource?: boolean;
};

async function handler(req: ApiRequestProps<UpdateChatVisibilityConfigBody, {}>) {
  const { appId, showNodeStatus, responseDetail, showFullText, showRawSource } = req.body;

  const { teamId, tmbId } = await authApp({
    req,
    authToken: true,
    appId,
    per: ManagePermissionVal
  });

  await MongoOutLink.findOneAndUpdate(
    { appId, type: PublishChannelEnum.chat },
    {
      $setOnInsert: {
        shareId: `chat-${appId}`,
        teamId,
        tmbId,
        name: 'Home Chat'
      },
      $set: {
        appId,
        type: PublishChannelEnum.chat,
        showNodeStatus: showNodeStatus ?? true,
        responseDetail: responseDetail ?? true,
        showFullText: showFullText ?? true,
        showRawSource: showRawSource ?? true
      }
    },
    { upsert: true }
  );
}

export default NextAPI(handler);
