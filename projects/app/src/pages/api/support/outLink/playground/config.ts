import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import {
  type PlaygroundVisibilityConfigQuery,
  type PlaygroundVisibilityConfigResponse,
  PlaygroundVisibilityConfigQuerySchema,
  PlaygroundVisibilityConfigResponseSchema
} from '@fastgpt/global/support/outLink/api';
async function handler(
  req: ApiRequestProps<{}, PlaygroundVisibilityConfigQuery>
): Promise<PlaygroundVisibilityConfigResponse> {
  const { appId } = PlaygroundVisibilityConfigQuerySchema.parse(req.query);

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
