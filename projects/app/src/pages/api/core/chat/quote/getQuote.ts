import { NextAPI } from '@/service/middleware/entry';
import { authChatCrud, authCollectionInChat } from '@/service/support/permission/auth/chat';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { quoteDataFieldSelector } from '@/service/core/chat/constants';
import { processChatTimeFilter } from '@/service/core/chat/utils';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { getFormatDatasetCiteList } from '@fastgpt/service/core/dataset/data/controller';
import type { DatasetCiteItemType } from '@fastgpt/global/core/dataset/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { isDatabaseSource, isCorrectionSource } from '@fastgpt/global/core/dataset/utils';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';

export type GetQuoteProps = {
  datasetDataIdList: string[];

  collectionIdList: string[];
  chatId: string;
  chatItemDataId: string;
  appId: string;
  shareId?: string;
  outLinkUid?: string;
  teamId?: string;
  teamToken?: string;
};

export type GetQuotesRes = DatasetCiteItemType[];

async function handler(req: ApiRequestProps<GetQuoteProps>): Promise<GetQuotesRes> {
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
  } = req.body;
  let filterCollectionIdList = collectionIdList.filter(
    (id) => id?.trim() && !isDatabaseSource(id) && !isCorrectionSource(id)
  );
  let filterdatasetDataIdList = datasetDataIdList.filter(
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
    MongoChatItem.findOne({ appId, chatId, dataId: chatItemDataId }, 'responseData time').lean() as Promise<{ time: Date; responseData?: ChatHistoryItemResType[] } | null>,
    authCollectionInChat({ appId, chatId, chatItemDataId, collectionIds: collectionIdList })
  ]);
  if (!chat || !chatItem || !showCite) return Promise.reject(ChatErrEnum.unAuthChat);

  const list = await MongoDatasetData.find(
    { _id: { $in: filterdatasetDataIdList }, collectionId: { $in: filterCollectionIdList } },
    quoteDataFieldSelector
  ).lean();

  // Get image preview url
  let formatPreviewUrlList: DatasetCiteItemType[] = getFormatDatasetCiteList(list);

  // Get sql Quote DatasetIds
  const Items = chatItem.responseData?.filter(
    (e) => e.moduleType === FlowNodeTypeEnum.datasetSearchNode
  );

  const sqlQuoteLists = Items?.map((item) => item.quoteList).flat();

  const updateInfo = await MongoDataset.find(
    { _id: { $in: sqlQuoteLists?.map((e) => e?.datasetId) || '' } },
    'updateTime'
  ).lean();

  const sqlFormatQuoteLists = Items?.map((item) => item.sqlResult)
    ?.flat()
    .filter((res): res is NonNullable<typeof res> => !!res && !!res.datasetId) // 确保 SQL 结果和 datasetId 不为空
    .map((res) => {
      const qInfo = sqlQuoteLists?.find((e) => e?.datasetId === res.datasetId);
      const uInfo = updateInfo.find((d) => d._id === res.datasetId);
      return {
        _id: qInfo?.id || `sql_quote_${res.datasetId}`,
        q: res.answer || '',
        a: res.sql || '',
        updateTime: uInfo?.updateTime || chatItem.time
      } as DatasetCiteItemType;
    });
  formatPreviewUrlList.push(...(sqlFormatQuoteLists || []));

  // Get correction search results
  const correctionFormatQuoteLists = Items?.map((item) => item.correctSearchResult)
    ?.flat()
    .filter((res): res is NonNullable<typeof res> => !!res && !!res.correctedAnswer) // 确保校正答案不为空
    .map((res) => {
      return {
        _id: `correction_quote_${res.correctionId}`,
        q: res.question || '',
        a: res.correctedAnswer,
        updateTime: chatItem.time
      } as DatasetCiteItemType;
    });
  formatPreviewUrlList.push(...(correctionFormatQuoteLists || []));
  const quoteList = processChatTimeFilter(formatPreviewUrlList, chatItem.time);
  return quoteList;
}

export default NextAPI(handler);
