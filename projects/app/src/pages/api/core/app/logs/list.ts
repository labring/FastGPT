import { extendChatPublishSources } from '@fastgpt/service/core/chat/publishSource/service';
import { getChatPublishSourceType } from '@fastgpt/global/common/chat/publishSource';
import { buildAppChatLogFilter } from '@fastgpt/service/core/app/logs/utils';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { Types } from '@fastgpt/service/common/mongo';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import {
  ChatItemCollectionName,
  ChatItemResponseCollectionName
} from '@fastgpt/service/core/chat/constants';
import { NextAPI } from '@/service/middleware/entry';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { formatSourceMember } from '@fastgpt/service/support/user/utils';
import { getTeamMemberMap } from '@fastgpt/service/support/user/team/utils';
import { getLocationFromIp } from '@fastgpt/service/common/geo';
import { AppReadChatLogPerVal } from '@fastgpt/global/support/permission/app/constant';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { AppVersionCollectionName } from '@fastgpt/service/core/app/version/schema';
import {
  GetAppChatLogsBodySchema,
  GetAppChatLogsResponseSchema,
  type AppLogsListItemType,
  type getAppChatLogsResponseType
} from '@fastgpt/global/openapi/core/app/log/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { ChatSourceEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { isUnselectedLogUserFilter } from '@fastgpt/global/core/app/logs/utils';
import { getDisplayChatTitle } from '@fastgpt/service/core/chat/title';

async function handler(req: ApiRequestProps): Promise<getAppChatLogsResponseType> {
  const {
    appId,
    dateStart,
    dateEnd,
    sources,
    tmbIds,
    outLinkUids,
    chatSearch,
    feedbackType,
    unreadOnly,
    errorFilter
  } = parseApiInput({
    req,
    bodySchema: GetAppChatLogsBodySchema
  }).body;

  const { pageSize = 20, offset } = parsePaginationRequest(req);

  if (!appId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // 凭证校验
  const { teamId } = await authApp({
    req,
    authToken: true,
    authApiKey: true,
    authAppApiKey: true,
    appId,
    per: AppReadChatLogPerVal
  });

  if (isUnselectedLogUserFilter(tmbIds, outLinkUids)) {
    return GetAppChatLogsResponseSchema.parse({ list: [], total: 0 });
  }

  const where = buildAppChatLogFilter({
    appId,
    dateStart,
    dateEnd,
    sources,
    tmbIds,
    outLinkUids,
    chatSearch,
    feedbackType,
    unreadOnly,
    errorFilter
  });

  // Execute both queries
  const [listResult, total] = await Promise.all([
    // Execute the main aggregation
    MongoChat.aggregate<AppLogsListItemType>(
      [
        { $match: where },
        { $sort: { updateTime: -1 } },
        { $skip: offset },
        { $limit: pageSize },
        // Match chat_items for other statistics
        {
          $lookup: {
            from: ChatItemCollectionName,
            let: { appId: new Types.ObjectId(appId), chatId: '$chatId' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$appId', '$$appId'] },
                      { $eq: ['$chatId', '$$chatId'] },
                      {
                        $or: [
                          { $eq: ['$sourceType', ChatSourceTypeEnum.app] },
                          { $eq: [{ $type: '$sourceType' }, 'missing'] }
                        ]
                      }
                    ]
                  }
                }
              },
              {
                $group: {
                  _id: null,
                  messageCount: { $sum: 1 },
                  totalResponseTime: {
                    $sum: {
                      $cond: [{ $eq: ['$obj', 'AI'] }, { $ifNull: ['$durationSeconds', 0] }, 0]
                    }
                  },
                  aiMessageCount: {
                    $sum: {
                      $cond: [{ $eq: ['$obj', 'AI'] }, 1, 0]
                    }
                  },
                  adminMark: {
                    $sum: {
                      $cond: [{ $ifNull: ['$adminFeedback', false] }, 1, 0]
                    }
                  },
                  goodFeedback: {
                    $sum: {
                      $cond: [{ $ifNull: ['$userGoodFeedback', false] }, 1, 0]
                    }
                  },
                  badFeedback: {
                    $sum: {
                      $cond: [{ $ifNull: ['$userBadFeedback', false] }, 1, 0]
                    }
                  },
                  customFeedback: {
                    $sum: { $size: { $ifNull: ['$customFeedbacks', []] } }
                  },
                  totalPointsFromChatItem: {
                    $sum: {
                      $reduce: {
                        input: { $ifNull: ['$responseData', []] },
                        initialValue: 0,
                        in: { $add: ['$$value', { $ifNull: ['$$this.totalPoints', 0] }] }
                      }
                    }
                  }
                }
              }
            ],
            as: 'chatItemsData'
          }
        },
        // Match chatItemResponses
        {
          $lookup: {
            from: ChatItemResponseCollectionName,
            let: { appId: new Types.ObjectId(appId), chatId: '$chatId' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$appId', '$$appId'] },
                      { $eq: ['$chatId', '$$chatId'] },
                      {
                        $or: [
                          { $eq: ['$sourceType', ChatSourceTypeEnum.app] },
                          { $eq: [{ $type: '$sourceType' }, 'missing'] }
                        ]
                      }
                    ]
                  }
                }
              },
              {
                $group: {
                  _id: null,
                  // totalPoints from chatItemResponse data
                  totalPointsFromResponse: {
                    $sum: { $ifNull: ['$data.totalPoints', 0] }
                  }
                }
              }
            ],
            as: 'chatItemResponsesData'
          }
        },
        // Match app versions (use simple lookup for better performance with index)
        {
          $lookup: {
            from: AppVersionCollectionName,
            localField: 'appVersionId',
            foreignField: '_id',
            as: 'versionData'
          }
        },
        {
          $addFields: {
            messageCount: { $ifNull: [{ $arrayElemAt: ['$chatItemsData.messageCount', 0] }, 0] },
            // Use feedback counts from Chat table (redundant fields)
            userGoodFeedbackCount: {
              $ifNull: [{ $arrayElemAt: ['$chatItemsData.goodFeedback', 0] }, 0]
            },
            userBadFeedbackCount: {
              $ifNull: [{ $arrayElemAt: ['$chatItemsData.badFeedback', 0] }, 0]
            },
            customFeedbacksCount: {
              $ifNull: [{ $arrayElemAt: ['$chatItemsData.customFeedback', 0] }, 0]
            },
            markCount: { $ifNull: [{ $arrayElemAt: ['$chatItemsData.adminMark', 0] }, 0] },
            averageResponseTime: {
              $cond: [
                {
                  $gt: [{ $ifNull: [{ $arrayElemAt: ['$chatItemsData.aiMessageCount', 0] }, 0] }, 0]
                },
                {
                  $divide: [
                    { $ifNull: [{ $arrayElemAt: ['$chatItemsData.totalResponseTime', 0] }, 0] },
                    { $ifNull: [{ $arrayElemAt: ['$chatItemsData.aiMessageCount', 0] }, 1] }
                  ]
                },
                0
              ]
            },
            errorCount: { $ifNull: ['$errorCount', 0] },
            totalPoints: {
              $add: [
                { $ifNull: [{ $arrayElemAt: ['$chatItemsData.totalPointsFromChatItem', 0] }, 0] },
                {
                  $ifNull: [
                    { $arrayElemAt: ['$chatItemResponsesData.totalPointsFromResponse', 0] },
                    0
                  ]
                }
              ]
            },
            versionName: { $ifNull: [{ $arrayElemAt: ['$versionData.versionName', 0] }, null] }
          }
        },
        {
          $project: {
            _id: { $toString: '$_id' },
            chatId: 1,
            title: 1,
            customTitle: 1,
            source: 1,
            sourceName: 1,
            publishSource: 1,
            updateTime: 1,
            createTime: 1,
            messageCount: 1,
            userGoodFeedbackCount: 1,
            userBadFeedbackCount: 1,
            customFeedbacksCount: 1,
            markCount: 1,
            averageResponseTime: 1,
            errorCount: 1,
            totalPoints: 1,
            outLinkUid: 1,
            tmbId: {
              $cond: {
                if: { $eq: ['$tmbId', null] },
                then: null,
                else: { $toString: '$tmbId' }
              }
            },
            versionName: 1,
            region: '$metadata.originIp'
          }
        }
      ],
      { ...readFromSecondary }
    ),
    // Execute the count pipeline
    MongoChat.countDocuments(where, { ...readFromSecondary })
  ]);

  const list = await extendChatPublishSources({ list: listResult, teamId, appId });

  const listWithRegion = list.map((item) => {
    const ip = item.region;
    const region = getLocationFromIp(ip ?? undefined, getLocale(req));

    return {
      ...item,
      originIp: ip,
      region: region || ip
    };
  });

  // 一次读取本页鉴权者及分享访客，且限制在已鉴权团队中。
  const memberIds = listWithRegion
    .flatMap((item) => [
      item.tmbId,
      ...(getChatPublishSourceType(item) === ChatSourceEnum.share && item.outLinkUid
        ? [item.outLinkUid]
        : [])
    ])
    .filter((id): id is string => typeof id === 'string');
  const memberMap = await getTeamMemberMap({
    teamId,
    memberIds,
    fields: '_id name avatar status'
  });

  const finalList = listWithRegion.map((item) => {
    const member = memberMap.get(String(item.tmbId));
    const authMember = member ? formatSourceMember(member) : undefined;
    // sourceMember 保留旧接口语义；authMember 始终属于 tmbId，不被外链访客覆盖。
    const sourceMember = (() => {
      if (getChatPublishSourceType(item) !== ChatSourceEnum.share || !item.outLinkUid)
        return authMember;
      const visitor = memberMap.get(String(item.outLinkUid));
      return visitor ? formatSourceMember(visitor) : undefined;
    })();
    return {
      ...item,
      authMember,
      sourceMember,
      title: getDisplayChatTitle({ customTitle: item.customTitle, title: item.title })
    };
  });

  return GetAppChatLogsResponseSchema.parse({
    list: finalList,
    total
  });
}

export default NextAPI(handler);
