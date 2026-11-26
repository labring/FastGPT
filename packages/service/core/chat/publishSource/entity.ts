import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { getChatSourceByPublishChannel } from '@fastgpt/global/core/chat/utils';
import type { ChatPublishSourceType } from '@fastgpt/global/core/chat/publishSource/type';
import { Types } from '../../../common/mongo';
import { MongoOpenApi } from '../../../support/openapi/schema';
import { MongoOutLink } from '../../../support/outLink/schema';
import { MongoMcpKey } from '../../../support/mcp/schema';

/** 按本页实际渠道集合批量取名；只投影名称与归属，绝不读取密钥或渠道凭证配置。 */
export const getChatPublishSourceNames = async ({
  teamId,
  appId,
  sources
}: {
  teamId: string;
  appId: string;
  sources: Partial<ChatPublishSourceType>[];
}) => {
  const ids = (types: ChatSourceEnum[]) =>
    [
      ...new Set(sources.filter((s) => s.type && types.includes(s.type)).map((s) => String(s.id)))
    ].filter((id) => Types.ObjectId.isValid(id));
  const apiIds = ids([ChatSourceEnum.api]);
  const mcpIds = ids([ChatSourceEnum.mcp]);
  const outLinkIds = ids([
    ChatSourceEnum.share,
    ChatSourceEnum.feishu,
    ChatSourceEnum.wecom,
    ChatSourceEnum.wechat,
    ChatSourceEnum.official_account,
    ChatSourceEnum.dingtalk
  ]);
  const [apiKeys, mcpKeys, outLinks] = await Promise.all([
    apiIds.length ? MongoOpenApi.find({ teamId, _id: { $in: apiIds } }, '_id name').lean() : [],
    mcpIds.length
      ? MongoMcpKey.find({ teamId, _id: { $in: mcpIds }, 'apps.appId': appId }, '_id name').lean()
      : [],
    outLinkIds.length
      ? MongoOutLink.find({ teamId, appId, _id: { $in: outLinkIds } }, '_id name type').lean()
      : []
  ]);
  return new Map<string, string>([
    ...apiKeys.map((item) => [`${ChatSourceEnum.api}:${item._id}`, item.name] as const),
    ...mcpKeys.map((item) => [`${ChatSourceEnum.mcp}:${item._id}`, item.name] as const),
    ...outLinks.map(
      (item) => [`${getChatSourceByPublishChannel(item.type)}:${item._id}`, item.name] as const
    )
  ]);
};
