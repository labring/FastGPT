import { Types } from '@fastgpt/service/common/mongo';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  OutLinkCountQuerySchema,
  OutLinkCountResponseSchema,
  type OutLinkCountQueryType,
  type OutLinkCountResponseType
} from '@fastgpt/global/openapi/support/outLink/api';

const countTypes = [
  PublishChannelEnum.share,
  PublishChannelEnum.feishu,
  PublishChannelEnum.dingtalk,
  PublishChannelEnum.wecom,
  PublishChannelEnum.wechat,
  PublishChannelEnum.officialAccount
] as const;

type OutLinkCountType = (typeof countTypes)[number];

/** 获取侧栏展示的发布渠道连接数，缺失渠道补零。 */
async function handler(
  req: ApiRequestProps<undefined, OutLinkCountQueryType>
): Promise<OutLinkCountResponseType> {
  const { appId } = parseApiInput({
    req,
    querySchema: OutLinkCountQuerySchema
  }).query;
  await authApp({
    req,
    authToken: true,
    appId,
    per: ManagePermissionVal
  });

  const groupedCounts = await MongoOutLink.aggregate<{ _id: OutLinkCountType; count: number }>([
    {
      $match: {
        appId: new Types.ObjectId(appId),
        type: { $in: countTypes }
      }
    },
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 }
      }
    }
  ]);
  const counts: Record<OutLinkCountType, number> = {
    [PublishChannelEnum.share]: 0,
    [PublishChannelEnum.feishu]: 0,
    [PublishChannelEnum.dingtalk]: 0,
    [PublishChannelEnum.wecom]: 0,
    [PublishChannelEnum.wechat]: 0,
    [PublishChannelEnum.officialAccount]: 0
  };

  groupedCounts.forEach(({ _id, count }) => {
    counts[_id] = count;
  });

  return OutLinkCountResponseSchema.parse(counts);
}

export default NextAPI(handler);
