import type { NextApiRequest, NextApiResponse } from 'next';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { type AppLogsListItemType } from '@/types/app';
import { Types } from '@fastgpt/service/common/mongo';
import { addDays } from 'date-fns';
import type { GetAppChatLogsParams } from '@/global/core/api/appReq.d';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { ChatItemCollectionName } from '@fastgpt/service/core/chat/chatItemSchema';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { type PaginationResponse } from '@fastgpt/web/common/fetch/type';
import { addSourceMember } from '@fastgpt/service/support/user/utils';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getI18nAppType } from '@fastgpt/service/support/user/audit/util';

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
  const { teamId, tmbId, app } = await authApp({
    req,
    authToken: true,
    appId,
    per: WritePermissionVal
  });

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
              {
                $group: {
                  _id: null,
                  messageCount: { $sum: 1 },
                  goodFeedback: { $sum: { $cond: [{ $eq: ['$userGoodFeedback', true] }, 1, 0] } },
                  badFeedback: { $sum: { $cond: [{ $eq: ['$userBadFeedback', true] }, 1, 0] } },
                  customFeedback: {
                    $sum: {
                      $cond: [{ $gt: [{ $size: { $ifNull: ['$customFeedbacks', []] } }, 0] }, 1, 0]
                    }
                  },
                  adminMark: { $sum: { $cond: [{ $eq: ['$adminFeedback', true] }, 1, 0] } }
                }
              }
            ],
            as: 'chatItemsData'
          }
        },
        {
          $addFields: {
            messageCount: { $ifNull: [{ $arrayElemAt: ['$chatItemsData.messageCount', 0] }, 0] },
            userGoodFeedbackCount: {
              $ifNull: [{ $arrayElemAt: ['$chatItemsData.goodFeedback', 0] }, 0]
            },
            userBadFeedbackCount: {
              $ifNull: [{ $arrayElemAt: ['$chatItemsData.badFeedback', 0] }, 0]
            },
            customFeedbacksCount: {
              $ifNull: [{ $arrayElemAt: ['$chatItemsData.customFeedback', 0] }, 0]
            },
            markCount: { $ifNull: [{ $arrayElemAt: ['$chatItemsData.adminMark', 0] }, 0] }
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

  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.EXPORT_APP_CHAT_LOG,
      params: {
        appName: app.name,
        appType: getI18nAppType(app.type)
      }
    });
  })();

  return {
    list: listWithSourceMember.concat(listWithoutTmbId),
    total
  };
}

export default NextAPI(handler);
