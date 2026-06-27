import { NextAPI } from '@/service/middleware/entry';
import { authCollectionInChat } from '@/service/support/permission/auth/chat';
import { authChatTargetCrud } from '@/service/support/permission/auth/chat';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { quoteDataFieldSelector } from '@/service/core/chat/constants';
import { processChatTimeFilter } from '@/service/core/chat/utils';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { getFormatDatasetCiteList } from '@fastgpt/service/core/dataset/data/controller';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import {
  GetQuoteBodySchema,
  GetQuoteResponseSchema,
  type GetQuoteResponseType
} from '@fastgpt/global/openapi/core/chat/record/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { buildChatSourceQuery } from '@fastgpt/service/core/chat/source';

async function handler(req: ApiRequestProps): Promise<GetQuoteResponseType> {
  const {
    sourceType,
    sourceId,
    chatId,
    chatItemDataId,
    shareId,
    outLinkUid,
    teamId,
    teamToken,
    collectionIdList,
    datasetDataIdList
  } = parseApiInput({ req, bodySchema: GetQuoteBodySchema }).body;

  const [{ chat, showCite }, chatItem] = await Promise.all([
    authChatTargetCrud({
      req,
      authToken: true,
      authApiKey: true,
      sourceType,
      sourceId,
      chatId,
      shareId,
      outLinkUid,
      teamId,
      teamToken
    }),
    MongoChatItem.findOne(
      { ...buildChatSourceQuery({ sourceType, sourceId }), chatId, dataId: chatItemDataId },
      'time'
    ).lean(),
    authCollectionInChat({ sourceType, sourceId, chatId: chatId!, collectionIds: collectionIdList })
  ]);
  if (!chat || !chatItem || !showCite) return Promise.reject(ChatErrEnum.unAuthChat);

  const list = await MongoDatasetData.find(
    { _id: { $in: datasetDataIdList }, collectionId: { $in: collectionIdList } },
    quoteDataFieldSelector
  ).lean();

  const formatPreviewUrlList = getFormatDatasetCiteList(list);
  const quoteList = processChatTimeFilter(formatPreviewUrlList, chatItem.time);

  return GetQuoteResponseSchema.parse(quoteList);
}

export default NextAPI(handler);
