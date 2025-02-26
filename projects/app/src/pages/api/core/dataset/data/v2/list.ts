import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { DatasetDataListItemType } from '@/global/core/dataset/type';
import { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { authOutLink } from '@/service/support/permission/auth/outLink';

export type GetDatasetDataListProps = PaginationProps & {
  searchText?: string;
  collectionId: string;
  chatTime?: Date;
  chatItemId?: string;
  datasetDataIdList?: string[];
  shareId?: string;
  outLinkUid?: string;
};
export type GetDatasetDataListRes = PaginationResponse<DatasetDataListItemType>;

async function handler(
  req: ApiRequestProps<GetDatasetDataListProps>
): Promise<GetDatasetDataListRes> {
  let {
    searchText = '',
    collectionId,
    chatTime,
    chatItemId,
    datasetDataIdList,
    shareId,
    outLinkUid
  } = req.body;
  let { offset, pageSize } = parsePaginationRequest(req);

  pageSize = Math.min(pageSize, 30);

  // 凭证校验
  if (shareId || outLinkUid) {
    await authOutLink({ shareId, outLinkUid });
  } else if (collectionId) {
    await authDatasetCollection({
      req,
      authToken: true,
      authApiKey: true,
      collectionId,
      per: ReadPermissionVal
    });
  }
  //todo 如果只有datasetDataIdList

  const queryReg = new RegExp(`${replaceRegChars(searchText)}`, 'i');
  const match = datasetDataIdList
    ? {
        _id: { $in: datasetDataIdList }
      }
    : {
        // teamId,
        // datasetId: collection.datasetId,
        collectionId,
        ...(searchText.trim()
          ? {
              $or: [{ q: queryReg }, { a: queryReg }]
            }
          : {}),
        ...(chatTime
          ? {
              $or: [
                { updateTime: { $lt: new Date(chatTime) } },
                { history: { $elemMatch: { updateTime: { $lt: new Date(chatTime) } } } }
              ]
            }
          : {})
      };

  const [list, total] = await Promise.all([
    MongoDatasetData.find(
      match,
      '_id datasetId collectionId q a chunkIndex history updateTime currentChatItemId'
    )
      .sort({ chunkIndex: 1, updateTime: -1 })
      .skip(offset)
      .limit(pageSize)
      .lean(),
    MongoDatasetData.countDocuments(match)
  ]);

  const listWithHistory = list.map((item) => {
    if (!chatTime || !item.history) {
      return item;
    }
    const { history, ...rest } = item;
    const formatedChatTime = new Date(chatTime);

    if (item.updateTime <= formatedChatTime) {
      return {
        ...rest
      };
    }

    const latestHistoryIndex = history.findIndex(
      (historyItem) => historyItem.updateTime <= formatedChatTime
    );

    const updatedData =
      item.currentChatItemId === chatItemId
        ? rest
        : history
            .slice(0, latestHistoryIndex)
            .find((historyItem) => historyItem.currentChatItemId === chatItemId);

    const latestHistory = history[latestHistoryIndex];

    return {
      ...rest,
      q: latestHistory?.q || item.q,
      a: latestHistory?.a || item.a,
      updatedData
    };
  });

  return {
    list: listWithHistory,
    total
  };
}

export default NextAPI(handler);
