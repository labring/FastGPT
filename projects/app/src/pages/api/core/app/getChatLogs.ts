import type { NextApiRequest, NextApiResponse } from 'next';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { AppLogsListItemType } from '@/types/app';
import { Types } from '@fastgpt/service/common/mongo';
import { addDays } from 'date-fns';
import type { GetAppChatLogsParams } from '@/global/core/api/appReq.d';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { ChatItemCollectionName } from '@fastgpt/service/core/chat/chatItemSchema';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { PaginationResponse } from '@fastgpt/web/common/fetch/type';
import { addSourceMember } from '@fastgpt/service/support/user/utils';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';

async function handler(
  req: NextApiRequest,
  _res: NextApiResponse
): Promise<PaginationResponse<AppLogsListItemType>> {
  const {
    appId,
    dateStart = addDays(new Date(), -7),
    dateEnd = new Date(),
    sources,
    logTitle
  } = req.body as GetAppChatLogsParams;

  const { pageSize = 20, offset } = parsePaginationRequest(req);

  if (!appId) {
    throw new Error('缺少参数');
  }

  // 凭证校验
  const { teamId } = await authApp({ req, authToken: true, appId, per: WritePermissionVal });

  const where = {
    teamId: new Types.ObjectId(teamId),
    appId: new Types.ObjectId(appId),
    updateTime: {
      $gte: new Date(dateStart),
      $lte: new Date(dateEnd)
    },
    ...(sources && { source: { $in: sources } }),
    ...(logTitle && {
      $or: [
        { title: { $regex: new RegExp(`${replaceRegChars(logTitle)}`, 'i') } },
        { customTitle: { $regex: new RegExp(`${replaceRegChars(logTitle)}`, 'i') } }
      ]
    })
  };

  const [list, total] = await Promise.all([
    MongoChat.aggregate(
      [
        { $match: where },
        {
          $sort: {
            updateTime: -1
          }
        },
        { $skip: offset },
        { $limit: pageSize },
        {
          $lookup: {
            from: ChatItemCollectionName,
            let: { chatId: '$chatId', appId: new Types.ObjectId(appId) },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [{ $eq: ['$appId', '$$appId'] }, { $eq: ['$chatId', '$$chatId'] }]
                  }
                }
              },
              { $count: 'messageCount' }
            ],
            as: 'messageCountData'
          }
        },
        {
          $lookup: {
            from: ChatItemCollectionName,
            let: { chatId: '$chatId', appId: new Types.ObjectId(appId) },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$appId', '$$appId'] },
                      { $eq: ['$chatId', '$$chatId'] },
                      { $eq: ['$userGoodFeedback', true] }
                    ]
                  }
                }
              },
              { $count: 'count' }
            ],
            as: 'userGoodFeedbackData'
          }
        },
        {
          $lookup: {
            from: ChatItemCollectionName,
            let: { chatId: '$chatId', appId: new Types.ObjectId(appId) },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$appId', '$$appId'] },
                      { $eq: ['$chatId', '$$chatId'] },
                      { $eq: ['$userBadFeedback', true] }
                    ]
                  }
                }
              },
              { $count: 'count' }
            ],
            as: 'userBadFeedbackData'
          }
        },
        {
          $lookup: {
            from: ChatItemCollectionName,
            let: { chatId: '$chatId', appId: new Types.ObjectId(appId) },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$appId', '$$appId'] },
                      { $eq: ['$chatId', '$$chatId'] },
                      { $gt: [{ $size: { $ifNull: ['$customFeedbacks', []] } }, 0] }
                    ]
                  }
                }
              },
              { $count: 'count' }
            ],
            as: 'customFeedbacksData'
          }
        },
        {
          $lookup: {
            from: ChatItemCollectionName,
            let: { chatId: '$chatId', appId: new Types.ObjectId(appId) },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$appId', '$$appId'] },
                      { $eq: ['$chatId', '$$chatId'] },
                      { $eq: ['$adminFeedback', true] }
                    ]
                  }
                }
              },
              { $count: 'count' }
            ],
            as: 'markData'
          }
        },
        {
          $addFields: {
            userGoodFeedbackCount: {
              $ifNull: [{ $arrayElemAt: ['$userGoodFeedbackData.count', 0] }, 0]
            },
            userBadFeedbackCount: {
              $ifNull: [{ $arrayElemAt: ['$userBadFeedbackData.count', 0] }, 0]
            },
            customFeedbacksCount: {
              $ifNull: [{ $arrayElemAt: ['$customFeedbacksData.count', 0] }, 0]
            },
            markCount: { $ifNull: [{ $arrayElemAt: ['$markData.count', 0] }, 0] },
            messageCount: { $ifNull: [{ $arrayElemAt: ['$messageCountData.messageCount', 0] }, 0] }
          }
        },
        {
          $project: {
            _id: 1,
            id: '$chatId',
            title: 1,
            customTitle: 1,
            source: 1,
            sourceName: 1,
            time: '$updateTime',
            messageCount: 1,
            userGoodFeedbackCount: 1,
            userBadFeedbackCount: 1,
            customFeedbacksCount: 1,
            markCount: 1,
            outLinkUid: 1,
            tmbId: 1
          }
        }
      ],
      {
        ...readFromSecondary
      }
    ),
    MongoChat.countDocuments(where, { ...readFromSecondary })
  ]);

  const listWithSourceMember = await addSourceMember({
    list: list
  });

  const listWithoutTmbId = list.filter((item) => !item.tmbId);

  return {
    list: listWithSourceMember.concat(listWithoutTmbId),
    total
  };
}

export default NextAPI(handler);
