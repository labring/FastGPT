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
import { addSourceMember, formatSourceMember } from '@fastgpt/service/support/user/utils';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { getLocationFromIp } from '@fastgpt/service/common/geo';
import { AppReadChatLogPerVal } from '@fastgpt/global/support/permission/app/constant';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { AppVersionCollectionName } from '@fastgpt/service/core/app/version/schema';
import {
  GetAppChatLogsBodySchema,
  GetAppChatLogsResponseSchema,
  type getAppChatLogsResponseType
} from '@fastgpt/global/openapi/core/app/log/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { ChatSourceEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { isUnselectedLogUserFilter } from '@fastgpt/global/core/app/logs/utils';

const appChatSourceMatch = {
  $or: [{ sourceType: ChatSourceTypeEnum.app }, { sourceType: { $exists: false } }]
};

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
    appId,
    per: AppReadChatLogPerVal
  });

  if (isUnselectedLogUserFilter(tmbIds, outLinkUids)) {
    return GetAppChatLogsResponseSchema.parse({ list: [], total: 0 });
  }

  const where = {
    appId: new Types.ObjectId(appId),
    $and: [appChatSourceMatch],
    // Feedback type filtering (BEFORE pagination for performance)
    ...(feedbackType === 'has_feedback' &&
      !unreadOnly && {
        $or: [{ hasGoodFeedback: true }, { hasBadFeedback: true }]
      }),
    ...(feedbackType === 'has_feedback' &&
      unreadOnly && {
        $or: [{ hasUnreadGoodFeedback: true }, { hasUnreadBadFeedback: true }]
      }),
    ...(feedbackType === 'good' &&
      !unreadOnly && {
        hasGoodFeedback: true
      }),
    ...(feedbackType === 'good' &&
      unreadOnly && {
        hasUnreadGoodFeedback: true
      }),
    ...(feedbackType === 'bad' &&
      !unreadOnly && {
        hasBadFeedback: true
      }),
    ...(feedbackType === 'bad' &&
      unreadOnly && {
        hasUnreadBadFeedback: true
      }),
    ...(errorFilter === 'has_error' && {
      errorCount: { $gt: 0 }
    }),
    ...(sources && { source: { $in: sources } }),
    // User filter: tmbIds(排除外链用户) 或 outLinkUids
    ...((tmbIds?.length || outLinkUids?.length) && {
      $or: [
        ...(tmbIds?.length
          ? [
              {
                tmbId: { $in: tmbIds.map((id) => new Types.ObjectId(id)) },
                outLinkUid: { $in: [null, ''] }
              }
            ]
          : []),
        ...(outLinkUids?.length ? [{ outLinkUid: { $in: outLinkUids } }] : [])
      ]
    }),
    updateTime: {
      $gte: new Date(dateStart),
      $lte: new Date(dateEnd)
    },
    ...(chatSearch
      ? {
          $or: [
            { chatId: { $regex: new RegExp(`${replaceRegChars(chatSearch)}`, 'i') } },
            { title: { $regex: new RegExp(`${replaceRegChars(chatSearch)}`, 'i') } },
            { customTitle: { $regex: new RegExp(`${replaceRegChars(chatSearch)}`, 'i') } }
          ]
        }
      : undefined)
  };

  // Execute both queries
  const [listResult, total] = await Promise.all([
    // Execute the main aggregation
    MongoChat.aggregate(
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

  const list = listResult;

  const listWithRegion = list.map((item) => {
    const ip = item.region;
    const region = getLocationFromIp(ip, getLocale(req));

    return {
      ...item,
      originIp: ip,
      region: region || ip
    };
  });

  // Resolve the normal online/API member first. For an out-link, tmbId belongs to the publisher.
  const listWithSourceMember = await addSourceMember({ list: listWithRegion });
  const sourceMemberMap = new Map(listWithSourceMember.map((item) => [String(item._id), item]));

  // Protected share links put the visitor's member ID in outLinkUid. Keep former members
  // visible with their status, matching the regular chat log member lookup.
  const shareItemsWithOutLinkUid = listWithRegion.filter(
    (item) => item.source === ChatSourceEnum.share && item.outLinkUid
  );
  const candidateTmbIds = shareItemsWithOutLinkUid
    .filter((item) => Types.ObjectId.isValid(item.outLinkUid))
    .map((item) => new Types.ObjectId(item.outLinkUid));
  const outLinkMembers = candidateTmbIds.length
    ? await MongoTeamMember.find(
        {
          _id: { $in: candidateTmbIds },
          teamId: new Types.ObjectId(teamId)
        },
        '_id name avatar status'
      ).lean()
    : [];
  const outLinkMemberMap = new Map(outLinkMembers.map((member) => [String(member._id), member]));

  const finalList = listWithRegion.map((item) => {
    const result = sourceMemberMap.get(String(item._id)) || { ...item, sourceMember: undefined };
    if (item.source !== ChatSourceEnum.share || !item.outLinkUid) return result;

    const member = outLinkMemberMap.get(String(item.outLinkUid));
    return { ...result, sourceMember: member ? formatSourceMember(member) : undefined };
  });

  return GetAppChatLogsResponseSchema.parse({
    list: finalList,
    total
  });
}

export default NextAPI(handler);
