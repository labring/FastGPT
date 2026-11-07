import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { ChatRoleEnum, type ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { buildChatSourceAggregateMatch } from '@fastgpt/service/core/chat/source';

/**
 * 校验文档是否来自当前会话引用。
 *
 * 只依赖 ChatItem 上的 citeCollectionIds 判断 collection 是否在当前会话中被引用，
 * 避免读取和解析完整 responseData。
 */
export const authCollectionInChat = async ({
  collectionIds,
  sourceType,
  sourceId,
  chatId
}: {
  collectionIds: string[];
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  chatId: string;
}) => {
  const targetCollectionIds = collectionIds.map(String);

  const [authResult] = await MongoChatItem.aggregate<{ isAuthorized: boolean }>([
    {
      $match: {
        ...buildChatSourceAggregateMatch({ sourceType, sourceId }),
        chatId,
        obj: ChatRoleEnum.AI
      }
    },
    { $sort: { _id: -1 } },
    { $limit: 50 },
    { $unwind: '$citeCollectionIds' },
    {
      $group: {
        _id: null,
        citeCollectionIds: { $addToSet: { $toString: '$citeCollectionIds' } }
      }
    },
    {
      $project: {
        _id: 0,
        isAuthorized: { $setIsSubset: [targetCollectionIds, '$citeCollectionIds'] }
      }
    }
  ]);

  if (authResult?.isAuthorized) {
    return;
  }
  return Promise.reject(DatasetErrEnum.unAuthDatasetFile);
};
