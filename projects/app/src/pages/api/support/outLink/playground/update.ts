import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import {
  type UpdatePlaygroundVisibilityConfigBody,
  UpdatePlaygroundVisibilityConfigBodySchema
} from '@fastgpt/global/support/outLink/api';

async function handler(req: ApiRequestProps<UpdatePlaygroundVisibilityConfigBody, {}>) {
  const { appId, showNodeStatus, responseDetail, showFullText, showRawSource } =
    UpdatePlaygroundVisibilityConfigBodySchema.parse(req.body);

  const { teamId, tmbId } = await authApp({
    req,
    authToken: true,
    appId,
    per: ManagePermissionVal
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
