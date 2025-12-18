import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import {
  type PlaygroundVisibilityConfigQuery,
  type PlaygroundVisibilityConfigResponse,
  PlaygroundVisibilityConfigQuerySchema,
  PlaygroundVisibilityConfigResponseSchema
} from '@fastgpt/global/support/outLink/api.d';

async function handler(
  req: ApiRequestProps<{}, PlaygroundVisibilityConfigQuery>
): Promise<PlaygroundVisibilityConfigResponse> {
  const { appId } = PlaygroundVisibilityConfigQuerySchema.parse(req.query);

  await authApp({
    req,
    authToken: true,
    appId,
    per: WritePermissionVal
  });

  const existingConfig = await MongoOutLink.findOne(
    {
      appId,
      type: PublishChannelEnum.playground
    },
    'showNodeStatus responseDetail showFullText showRawSource'
  ).lean();

  return PlaygroundVisibilityConfigResponseSchema.parse({
    showNodeStatus: existingConfig?.showNodeStatus ?? true,
    responseDetail: existingConfig?.responseDetail ?? true,
    showFullText: existingConfig?.showFullText ?? true,
    showRawSource: existingConfig?.showRawSource ?? true
  });
}

export default NextAPI(handler);
