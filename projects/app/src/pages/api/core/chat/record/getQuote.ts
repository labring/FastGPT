import { NextAPI } from '@/service/middleware/entry';
import { authChatCrud, authCollectionInChat } from '@/service/support/permission/auth/chat';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { quoteDataFieldSelector } from '@/service/core/chat/constants';
import { processChatTimeFilter } from '@/service/core/chat/utils';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { getFormatDatasetCiteList } from '@fastgpt/service/core/dataset/data/controller';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import {
  GetQuoteBodySchema,
  GetQuoteResponseSchema,
  type GetQuoteResponseType
} from '@fastgpt/global/openapi/core/chat/record/api';
import { isDatabaseSource, isCorrectionSource } from '@fastgpt/global/core/dataset/utils';

async function handler(req: ApiRequestProps): Promise<GetQuoteResponseType> {
  const {
    appId,
    chatId,
    chatItemDataId,
    shareId,
    outLinkUid,
    teamId,
    teamToken,
    collectionIdList,
    datasetDataIdList
  } = GetQuoteBodySchema.parse(req.body);

  const filterCollectionIdList = collectionIdList.filter(
    (id) => id?.trim() && !isDatabaseSource(id) && !isCorrectionSource(id)
  );
  const filterDatasetDataIdList = datasetDataIdList.filter(
    (id) => !isDatabaseSource(id) && !isCorrectionSource(id)
  );
  const [{ chat, showCite }, chatItem] = await Promise.all([
    authChatCrud({
      req,
      authToken: true,
      appId,
      chatId,
      shareId,
      outLinkUid,
      teamId,
      teamToken
    }),
    MongoChatItem.findOne(
      { appId, chatId, dataId: chatItemDataId },
      'responseData time'
    ).lean() as Promise<{ time: Date; responseData?: ChatHistoryItemResType[] } | null>,
    authCollectionInChat({ appId, chatId, chatItemDataId, collectionIds: collectionIdList })
  ]);
  if (!chat || !chatItem || !showCite) return Promise.reject(ChatErrEnum.unAuthChat);

  const list = await MongoDatasetData.find(
    { _id: { $in: filterDatasetDataIdList }, collectionId: { $in: filterCollectionIdList } },
    quoteDataFieldSelector
  ).lean();

  const formatPreviewUrlList = getFormatDatasetCiteList(list);
  const quoteList = processChatTimeFilter(formatPreviewUrlList, chatItem.time);

  return GetQuoteResponseSchema.parse(quoteList);
}

export default NextAPI(handler);
