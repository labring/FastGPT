import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import type { ChatVisibilityConfigType } from '@fastgpt/global/core/app/type';

export type ChatVisibilityConfigQuery = {
  appId: string;
};

export type ChatVisibilityConfigResponse = ChatVisibilityConfigType;
async function handler(
  req: ApiRequestProps<{}, ChatVisibilityConfigQuery>
): Promise<ChatVisibilityConfigResponse> {
  const { appId } = req.query;

  const existingConfig = await MongoOutLink.findOne(
    {
      appId,
      type: PublishChannelEnum.chat
    },
    'showNodeStatus responseDetail showFullText showRawSource'
  ).lean();

  return {
    showNodeStatus: existingConfig?.showNodeStatus ?? true,
    responseDetail: existingConfig?.responseDetail ?? true,
    showFullText: existingConfig?.showFullText ?? true,
    showRawSource: existingConfig?.showRawSource ?? true
  };
}

export default NextAPI(handler);
