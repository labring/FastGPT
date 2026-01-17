import { NextAPI } from '@/service/middleware/entry';
import { authChatCrud, authCollectionInChat } from '@/service/support/permission/auth/chat';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { quoteDataFieldSelector } from '@/service/core/chat/constants';
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

export type AssistantGetQuoteProps = {
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

export type AssistantGetQuotesRes = AssistantDatasetCiteItemType[];

/**
 * 批量识别引用的来源类型
 */
async function batchIdentifySourceType(
  quotes: DatasetCiteItemType[],
  collectionIds: string[]
): Promise<AssistantDatasetCiteItemType[]> {
  // 收集所有需要查询的 collectionId（过滤掉特殊来源的 ID）
  const uniqueCollectionIds = Array.from(
    new Set(collectionIds.filter((id) => id && !isDatabaseSource(id) && !isCorrectionSource(id)))
  );

  // 批量查询 collection 的 trainingType
  const collections = await MongoDatasetCollection.find(
    { _id: { $in: uniqueCollectionIds } },
    '_id trainingType'
  ).lean();

  const collectionMap = new Map(collections.map((c) => [String(c._id), c.trainingType]));

  // 为每个引用识别来源类型
  return quotes.map((quote, index) => {
    const collectionId = collectionIds[index];
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
    else if (collectionId) {
      const mode = collectionMap.get(String(collectionId));
      if (mode === DatasetCollectionDataProcessModeEnum.template) {
        sourceType = 'faq';
      }
    }

    return {
      ...quote,
      sourceType
    };
  });
}

async function handler(
  req: ApiRequestProps<AssistantGetQuoteProps>
): Promise<AssistantGetQuotesRes> {
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

  // 提取所有真实的 collectionId 用于权限验证（去除特殊前缀）
  const authCollectionIds = collectionIdList.filter(
    (id) => !isDatabaseSource(id) && !isCorrectionSource(id)
  );

  // 3. 权限验证
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
    authCollectionInChat({ appId, chatId, chatItemDataId, collectionIds: authCollectionIds })
  ]);

  if (!chat || !responseDetail) return Promise.reject(ChatErrEnum.unAuthChat);

  // 4. 查询普通知识库数据
  const list = await MongoDatasetData.find(
    { _id: { $in: filterdatasetDataIdList }, collectionId: { $in: filterCollectionIdList } },
    quoteDataFieldSelector
  ).lean();

  // 获取图片预览 URL
  let formatPreviewUrlList = getFormatDatasetCiteList(list);

  // 5. 获取 SQL 引用数据
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
    .filter((res): res is NonNullable<typeof res> => !!res && !!res.datasetId)
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

  // 6. 获取校正数据引用
  const correctionFormatQuoteLists = Items?.map((item) => item.correctSearchResult)
    ?.flat()
    .filter((res): res is NonNullable<typeof res> => !!res && !!res.correctedAnswer)
    .map((res) => {
      return {
        _id: `correction_quote_${res.correctionId}`,
        q: res.question || '',
        a: res.correctedAnswer,
        updateTime: chatItem.time
      } as DatasetCiteItemType;
    });
  formatPreviewUrlList.push(...(correctionFormatQuoteLists || []));

  // 7. 时间过滤
  const quoteList = processChatTimeFilter(formatPreviewUrlList, chatItem.time);

  // 8. 批量识别来源类型
  const quotesWithSourceType = await batchIdentifySourceType(quoteList, collectionIdList);

  return quotesWithSourceType;
}

export default NextAPI(handler);
