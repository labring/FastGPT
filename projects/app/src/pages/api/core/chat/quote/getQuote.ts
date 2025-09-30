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
import { chunk } from 'lodash';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
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
  let filterCollectionIdList = collectionIdList.filter((id) => id?.trim());
  let filterdatasetDataIdList = datasetDataIdList.filter((id) => !id?.startsWith('sql'));
  const [{ chat, responseDetail }, { chatItem }] = await Promise.all([
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
    authCollectionInChat({ appId, chatId, chatItemDataId, collectionIds: collectionIdList })
  ]);
  if (!chat || !responseDetail) return Promise.reject(ChatErrEnum.unAuthChat);

  const list = await MongoDatasetData.find(
    { _id: { $in: filterdatasetDataIdList }, collectionId: { $in: filterCollectionIdList } },
    quoteDataFieldSelector
  ).lean();

  // Get image preview url
  let formatPreviewUrlList = getFormatDatasetCiteList(list);

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
    .map((res) => {
      const qInfo = sqlQuoteLists?.find((e) => e?.datasetId === res?.datasetId);
      const uInfo = updateInfo.find((d) => d._id === res?.datasetId);
      return {
        _id: qInfo?.id || `sql_quote_${res?.datasetId}`,
        q: res?.answer || '',
        a: res?.sql || '',
        updateTime: uInfo?.updateTime || chatItem.time
      } as DatasetCiteItemType;
    });
  formatPreviewUrlList.push(...(sqlFormatQuoteLists || []));
  const quoteList = processChatTimeFilter(formatPreviewUrlList, chatItem.time);
  return quoteList;
}

export default NextAPI(handler);
