import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import {
  type UpdatePlaygroundVisibilityConfigBody,
  UpdatePlaygroundVisibilityConfigBodySchema
} from '@fastgpt/global/support/outLink/api.d';

async function handler(req: ApiRequestProps<UpdatePlaygroundVisibilityConfigBody, {}>) {
  const { appId, showRunningStatus, showCite, showFullText, canDownloadSource } =
    UpdatePlaygroundVisibilityConfigBodySchema.parse(req.body);

  const { teamId, tmbId } = await authApp({
    req,
    authToken: true,
    appId,
    per: WritePermissionVal
  });

  await MongoOutLink.updateOne(
    { appId, type: PublishChannelEnum.playground },
    {
      $setOnInsert: {
        shareId: `playground-${appId}`,
        teamId,
        tmbId,
        name: 'Playground Chat'
      },
      $set: {
        appId,
        type: PublishChannelEnum.playground,
        showRunningStatus: showRunningStatus,
        showCite: showCite,
        showFullText: showFullText,
        canDownloadSource: canDownloadSource
      }
    },
    { upsert: true }
  );
}

export default NextAPI(handler);
