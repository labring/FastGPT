import { NextAPI } from '@/service/middleware/entry';
import {
  authChatCrud,
  authCollectionInChatForRetrievalResult
} from '@/service/support/permission/auth/chat';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { quoteDataFieldSelectorForAssistant } from '@/service/core/chat/constants';
import { processChatTimeFilter } from '@/service/core/chat/utils';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { getFormatDatasetCiteList } from '@fastgpt/service/core/dataset/data/controller';
import type {
  DatasetCiteItemType,
  AssistantSourceType,
  AssistantDatasetCiteItemType
} from '@fastgpt/global/core/dataset/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { isDatabaseSource, isCorrectionSource } from '@fastgpt/global/core/dataset/utils';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { DatasetCollectionDataProcessModeEnum } from '@fastgpt/global/core/dataset/constants';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { MongoChatItemResponse } from '@fastgpt/service/core/chat/chatItemResponseSchema';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';

export type AssistantGetRetrievalResultsProps = {
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

export type AssistantGetRetrievalResultsRes = AssistantDatasetCiteItemType[];

/**
 * 批量识别引用的来源类型
 */
async function batchIdentifySourceType(
  quotes: DatasetCiteItemType[],
  datasetDataList: any[]
): Promise<AssistantDatasetCiteItemType[]> {
  // 建立 datasetDataId -> collectionId 的映射
  const dataIdToCollectionMap = new Map(
    datasetDataList.map((data) => [String(data._id), String(data.collectionId)])
  );

  // 收集所有需要查询的 collectionId（过滤掉空值）
  const uniqueCollectionIds = Array.from(
    new Set(
      datasetDataList
        .map((d) => d.collectionId)
        .filter((id) => id) // 过滤掉 undefined/null
        .map((id) => String(id))
    )
  );

  // 批量查询 collection 的 trainingType
  const collections = await MongoDatasetCollection.find(
    { _id: { $in: uniqueCollectionIds } },
    '_id trainingType'
  ).lean();

  const collectionMap = new Map(collections.map((c) => [String(c._id), c.trainingType]));

  // 为每个引用识别来源类型
  return quotes.map((quote) => {
    let sourceType: AssistantSourceType = 'chunk';

    // 将 _id 转换为字符串以便检查
    const quoteId = String(quote._id);

    // 1. 检查是否为 SQL 来源
    if (isDatabaseSource(quoteId)) {
      sourceType = 'sql';
    }
    // 2. 检查是否为校正数据来源
    else if (isCorrectionSource(quoteId)) {
      sourceType = 'correction';
    }
    // 3. 检查是否为 FAQ (template 模式)
    else {
      // 从映射中获取该 datasetData 对应的 collectionId
      const collectionId = dataIdToCollectionMap.get(quoteId);
      if (collectionId) {
        const mode = collectionMap.get(collectionId);
        if (mode === DatasetCollectionDataProcessModeEnum.template) {
          sourceType = 'faq';
        }
      }
    }

    return {
      ...quote,
      sourceType
    };
  });
}

async function handler(
  req: ApiRequestProps<AssistantGetRetrievalResultsProps>
): Promise<AssistantGetRetrievalResultsRes> {
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

  // 1. 验证应用类型是否为 assistant
  const app = await MongoApp.findById(appId, 'type').lean();
  if (app?.type !== AppTypeEnum.assistant) {
    return Promise.reject('This API only supports assistant type applications');
  }

  // 2. 过滤掉特殊来源的 ID（SQL 和 Correction）
  let filterCollectionIdList = collectionIdList.filter(
    (id) => id?.trim() && !isDatabaseSource(id) && !isCorrectionSource(id)
  );
  let filterdatasetDataIdList = datasetDataIdList.filter(
    (id) => !isDatabaseSource(id) && !isCorrectionSource(id)
  );

  // 3. 权限验证
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
    authCollectionInChatForRetrievalResult({
      appId,
      chatId,
      chatItemDataId,
      collectionIds: collectionIdList
    })
  ]);

  if (!chat || !showCite || !chatItem) return Promise.reject(ChatErrEnum.unAuthChat);

  // Concat response data
  if (!chatItem.responseData || chatItem.responseData.length === 0) {
    const chatItemResponses = await MongoChatItemResponse.find(
      { appId, chatId, chatItemDataId },
      { data: 1 }
    ).lean();
    chatItem.responseData = chatItemResponses.map((item) => item.data);
  }

  // 4. 查询普通知识库数据
  const list = await MongoDatasetData.find(
    { _id: { $in: filterdatasetDataIdList }, collectionId: { $in: filterCollectionIdList } },
    quoteDataFieldSelectorForAssistant
  ).lean();

  // 获取图片预览 URL
  let formatPreviewUrlList: DatasetCiteItemType[] = getFormatDatasetCiteList(list);

  // 5. 获取检索结果数据（从 chatItem.responseData）
  const Items = chatItem.responseData?.filter(
    (e) => e.moduleType === FlowNodeTypeEnum.datasetSearchNode
  );

  // 6. 获取 SQL 引用数据（与 getQuote 保持一致）
  const sqlQuoteLists = Items?.map((item) => item.quoteList).flat();

  const sqlUpdateInfo = await MongoDataset.find(
    { _id: { $in: sqlQuoteLists?.map((e) => e?.datasetId) || '' } },
    'updateTime'
  ).lean();

  const sqlFormatQuoteLists = Items?.map((item) => item.sqlResult)
    ?.flat()
    .filter((res): res is NonNullable<typeof res> => !!res && !!res.datasetId)
    .map((res) => {
      const qInfo = sqlQuoteLists?.find((e) => e?.datasetId === res.datasetId);
      const uInfo = sqlUpdateInfo.find((d) => d._id === res.datasetId);
      return {
        _id: qInfo?.id || `sql_quote_${res.datasetId}`,
        q: res.answer || '',
        a: res.sql || '',
        updateTime: uInfo?.updateTime || chatItem.time,
        index: 0
      } as DatasetCiteItemType;
    });
  formatPreviewUrlList.push(...(sqlFormatQuoteLists || []));

  // 8. 获取校正数据引用（与 getQuote 保持一致）
  const correctionFormatQuoteLists = Items?.map((item) => item.correctSearchResult)
    ?.flat()
    .filter((res): res is NonNullable<typeof res> => !!res && !!res.correctedAnswer)
    .map((res) => {
      return {
        _id: `correction_quote_${res.correctionId}`,
        q: res.question || '',
        a: res.correctedAnswer,
        updateTime: chatItem.time,
        index: 0
      } as DatasetCiteItemType;
    });
  formatPreviewUrlList.push(...(correctionFormatQuoteLists || []));

  // 9. 时间过滤
  const retrievalResultList = processChatTimeFilter(formatPreviewUrlList, chatItem.time);

  // 10. 批量识别来源类型
  const resultsWithSourceType = await batchIdentifySourceType(retrievalResultList, list);

  return resultsWithSourceType;
}

export default NextAPI(handler);
