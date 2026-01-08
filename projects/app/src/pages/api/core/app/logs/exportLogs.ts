import type { NextApiResponse } from 'next';
import { responseWriteController } from '@fastgpt/service/common/response';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';
import { addLog } from '@fastgpt/service/common/system/log';
import dayjs from 'dayjs';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { NextAPI } from '@/service/middleware/entry';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import {
  ChatItemCollectionName,
  ChatItemResponseCollectionName
} from '@fastgpt/service/core/chat/constants';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { type ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { AppLogKeysEnum } from '@fastgpt/global/core/app/logs/constants';
import { sanitizeCsvField } from '@fastgpt/service/common/file/csv';
import { AppReadChatLogPerVal } from '@fastgpt/global/support/permission/app/constant';
import { addAuditLog, getI18nAppType } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { useIPFrequencyLimit } from '@fastgpt/service/common/middle/reqFrequencyLimit';
import { getAppLatestVersion } from '@fastgpt/service/core/app/version/controller';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import { getTimezoneCodeFromStr } from '@fastgpt/global/common/time/timezone';
import { getLocationFromIp } from '@fastgpt/service/common/geo';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { AppVersionCollectionName } from '@fastgpt/service/core/app/version/schema';
import { ExportChatLogsBodySchema } from '@fastgpt/global/openapi/core/app/log/api';

const formatJsonString = (data: any) => {
  if (data == null) return '';
  if (typeof data === 'object') {
    return sanitizeCsvField(JSON.stringify(data));
  }
  return data;
};

async function handler(req: ApiRequestProps, res: NextApiResponse) {
  let {
    appId,
    dateStart,
    dateEnd,
    sources,
    tmbIds,
    chatSearch,
    title,
    sourcesMap,
    logKeys = [],
    feedbackType,
    unreadOnly
  } = ExportChatLogsBodySchema.parse(req.body);

  const locale = getLocale(req);
  const timezoneCode = getTimezoneCodeFromStr(dateStart);

  const { teamId, tmbId, app } = await authApp({
    req,
    authToken: true,
    appId,
    per: AppReadChatLogPerVal
  });
  const { chatConfig } = await getAppLatestVersion(appId, app);
  const variables = (chatConfig.variables || []).filter(
    (item) => item.type !== VariableInputEnum.password
  );

  // Get members
  const teamMemberWithContact = await MongoTeamMember.aggregate([
    { $match: { teamId: new Types.ObjectId(teamId) } },
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'user'
      }
    },
    {
      $project: {
        memberId: '$_id',
        teamId: 1,
        userId: 1,
        name: 1,
        role: 1,
        status: 1,
        contact: { $ifNull: [{ $arrayElemAt: ['$user.contact', 0] }, '-'] }
      }
    }
  ]);

  const where = {
    teamId: new Types.ObjectId(teamId),
    appId: new Types.ObjectId(appId),
    source: sources ? { $in: sources } : { $exists: true },
    tmbId: tmbIds ? { $in: tmbIds.map((item) => new Types.ObjectId(item)) } : { $exists: true },
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

  res.setHeader('Content-Type', 'text/csv; charset=utf-8;');
  res.setHeader('Content-Disposition', 'attachment; filename=usage.csv; ');

  const cursor = MongoChat.aggregate(
    [
      { $match: where },
      {
        $sort: { updateTime: -1 }
      },
      { $limit: 50000 },
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
            { $sort: { _id: 1 } },
            {
              $group: {
                _id: null,
                // Statistics aggregation
                messageCount: { $sum: 1 },
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
                  $sum: {
                    $cond: [{ $gt: [{ $size: { $ifNull: ['$customFeedbacks', []] } }, 0] }, 1, 0]
                  }
                },
                adminMark: {
                  $sum: {
                    $cond: [{ $ifNull: ['$adminFeedback', false] }, 1, 0]
                  }
                },
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
                errorCount: {
                  $sum: {
                    $cond: [
                      {
                        $gt: [
                          {
                            $size: {
                              $filter: {
                                input: { $ifNull: ['$responseData', []] },
                                as: 'item',
                                cond: { $ne: [{ $ifNull: ['$$item.errorText', null] }, null] }
                              }
                            }
                          },
                          0
                        ]
                      },
                      1,
                      0
                    ]
                  }
                },
                totalPoints: {
                  $sum: {
                    $reduce: {
                      input: { $ifNull: ['$responseData', []] },
                      initialValue: 0,
                      in: { $add: ['$$value', { $ifNull: ['$$this.totalPoints', 0] }] }
                    }
                  }
                },
                // Detailed chat items collection
                chatitems: {
                  $push: {
                    _id: '$_id',
                    value: '$value',
                    userGoodFeedback: '$userGoodFeedback',
                    userBadFeedback: '$userBadFeedback',
                    customFeedbacks: '$customFeedbacks',
                    adminFeedback: '$adminFeedback'
                  }
                }
              }
            }
          ],
          as: 'chatData'
        }
      },
      {
        $lookup: {
          from: ChatItemResponseCollectionName,
          let: { appId: new Types.ObjectId(appId), chatId: '$chatId' },
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
                // errorCount from chatItemResponse data
                errorCountFromResponse: {
                  $sum: {
                    $cond: [{ $ne: [{ $ifNull: ['$data.errorText', null] }, null] }, 1, 0]
                  }
                },
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
      {
        $lookup: {
          from: AppVersionCollectionName,
          localField: 'appVersionId',
          foreignField: '_id',
          pipeline: [
            {
              $project: {
                versionName: 1,
                _id: 0
              }
            }
          ],
          as: 'versionData'
        }
      },
      {
        $addFields: {
          messageCount: { $ifNull: [{ $arrayElemAt: ['$chatData.messageCount', 0] }, 0] },
          userGoodFeedbackCount: {
            $ifNull: [{ $arrayElemAt: ['$chatData.goodFeedback', 0] }, 0]
          },
          userBadFeedbackCount: {
            $ifNull: [{ $arrayElemAt: ['$chatData.badFeedback', 0] }, 0]
          },
          customFeedbacksCount: {
            $ifNull: [{ $arrayElemAt: ['$chatData.customFeedback', 0] }, 0]
          },
          markCount: { $ifNull: [{ $arrayElemAt: ['$chatData.adminMark', 0] }, 0] },
          averageResponseTime: {
            $cond: [
              {
                $gt: [{ $ifNull: [{ $arrayElemAt: ['$chatData.aiMessageCount', 0] }, 0] }, 0]
              },
              {
                $divide: [
                  { $ifNull: [{ $arrayElemAt: ['$chatData.totalResponseTime', 0] }, 0] },
                  { $ifNull: [{ $arrayElemAt: ['$chatData.aiMessageCount', 0] }, 1] }
                ]
              },
              0
            ]
          },
          // Merge errorCount from both sources
          errorCount: {
            $add: [
              { $ifNull: [{ $arrayElemAt: ['$chatData.errorCountFromChatItem', 0] }, 0] },
              {
                $ifNull: [{ $arrayElemAt: ['$chatItemResponsesData.errorCountFromResponse', 0] }, 0]
              }
            ]
          },
          // Merge totalPoints from both sources
          totalPoints: {
            $add: [
              { $ifNull: [{ $arrayElemAt: ['$chatData.totalPointsFromChatItem', 0] }, 0] },
              {
                $ifNull: [
                  { $arrayElemAt: ['$chatItemResponsesData.totalPointsFromResponse', 0] },
                  0
                ]
              }
            ]
          },
          userGoodFeedbackItems: {
            $filter: {
              input: { $ifNull: [{ $arrayElemAt: ['$chatData.chatitems', 0] }, []] },
              as: 'item',
              cond: { $ifNull: ['$$item.userGoodFeedback', false] }
            }
          },
          userBadFeedbackItems: {
            $filter: {
              input: { $ifNull: [{ $arrayElemAt: ['$chatData.chatitems', 0] }, []] },
              as: 'item',
              cond: { $ifNull: ['$$item.userBadFeedback', false] }
            }
          },
          customFeedbackItems: {
            $filter: {
              input: { $ifNull: [{ $arrayElemAt: ['$chatData.chatitems', 0] }, []] },
              as: 'item',
              cond: { $gt: [{ $size: { $ifNull: ['$$item.customFeedbacks', []] } }, 0] }
            }
          },
          markItems: {
            $filter: {
              input: { $ifNull: [{ $arrayElemAt: ['$chatData.chatitems', 0] }, []] },
              as: 'item',
              cond: { $ifNull: ['$$item.adminFeedback', false] }
            }
          },
          chatDetails: {
            $map: {
              input: {
                $slice: [{ $ifNull: [{ $arrayElemAt: ['$chatData.chatitems', 0] }, []] }, -100]
              },
              as: 'item',
              in: {
                id: '$$item._id',
                value: '$$item.value'
              }
            }
          },
          versionName: { $ifNull: [{ $arrayElemAt: ['$versionData.versionName', 0] }, null] }
        }
      },
      {
        $project: {
          _id: 1,
          id: '$chatId',
          title: 1,
          customTitle: 1,
          source: 1,
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
          tmbId: 1,
          versionName: 1,
          userGoodFeedbackItems: 1,
          userBadFeedbackItems: 1,
          customFeedbackItems: 1,
          markItems: 1,
          chatDetails: 1,
          variables: 1,
          originIp: '$metadata.originIp'
        }
      }
    ],
    {
      ...readFromSecondary
    }
  ).cursor({ batchSize: 1000 });

  const write = responseWriteController({
    res,
    readStream: cursor
  });

  write(
    `\uFEFF${title},${variables.map((variable) => formatJsonString(variable.label)).join(',')}`
  );

  cursor.on('data', (doc) => {
    const createdTime = doc.createTime
      ? dayjs(doc.createTime).utcOffset(timezoneCode).format('YYYY-MM-DD HH:mm:ss')
      : '';
    const lastConversationTime = doc.updateTime
      ? dayjs(doc.updateTime).utcOffset(timezoneCode).format('YYYY-MM-DD HH:mm:ss')
      : '';
    const source = sourcesMap[doc.source as ChatSourceEnum]?.label || doc.source;
    const titleStr = doc.customTitle || doc.title || '';
    const tmbName = doc.outLinkUid
      ? doc.outLinkUid
      : teamMemberWithContact.find((member) => String(member.memberId) === String(doc.tmbId))?.name;
    const region = getLocationFromIp(doc.originIp, locale);

    const valueMap: Record<string, () => any> = {
      [AppLogKeysEnum.SOURCE]: () => source,
      [AppLogKeysEnum.CREATED_TIME]: () => createdTime,
      [AppLogKeysEnum.LAST_CONVERSATION_TIME]: () => lastConversationTime,
      [AppLogKeysEnum.USER]: () => tmbName || '-',
      [AppLogKeysEnum.TITLE]: () => titleStr,
      [AppLogKeysEnum.SESSION_ID]: () => doc.id || '-',
      [AppLogKeysEnum.MESSAGE_COUNT]: () => doc.messageCount,
      [AppLogKeysEnum.FEEDBACK]: () => {
        const goodItems = (doc.userGoodFeedbackItems || []).map((item: any) => ({
          chatItemId: item._id,
          feedback: item.userGoodFeedback
        }));
        const badItems = (doc.userBadFeedbackItems || []).map((item: any) => ({
          chatItemId: item._id,
          feedback: item.userBadFeedback
        }));
        return formatJsonString({ good: goodItems, bad: badItems });
      },
      [AppLogKeysEnum.CUSTOM_FEEDBACK]: () => {
        const customItems = (doc.customFeedbackItems || []).map((item: any) => ({
          chatItemId: item._id,
          feedbacks: item.customFeedbacks || []
        }));
        return formatJsonString(customItems);
      },
      [AppLogKeysEnum.ANNOTATED_COUNT]: () => {
        const markItems = (doc.markItems || []).map((item: any) => ({
          chatItemId: item._id,
          feedback: item.adminFeedback
        }));
        return formatJsonString(markItems);
      },
      [AppLogKeysEnum.RESPONSE_TIME]: () =>
        doc.averageResponseTime ? Number(doc.averageResponseTime).toFixed(2) : 0,
      [AppLogKeysEnum.ERROR_COUNT]: () => doc.errorCount || 0,
      [AppLogKeysEnum.POINTS]: () => (doc.totalPoints ? Number(doc.totalPoints).toFixed(2) : 0),
      [AppLogKeysEnum.REGION]: () => region,
      versionName: () => doc.versionName || '',
      chatDetails: () => formatJsonString(doc.chatDetails || [])
    };

    let rowStr = [...logKeys, 'chatDetails']
      .map((key) => {
        const getter = valueMap[key];
        const val = getter ? getter() : '';
        return sanitizeCsvField(val ?? '');
      })
      .join(',');
    rowStr += `,${variables
      .map((variable) => {
        const value = doc.variables[variable.key] || '';
        return formatJsonString(value);
      })
      .join(',')}`;

    write(`\n${rowStr}`);
  });

  cursor.on('end', () => {
    cursor.close();
    res.end();
  });

  cursor.on('error', (err) => {
    addLog.error(`export chat logs error`, err);
    res.status(500);
    res.end();
  });

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
}

export default NextAPI(
  useIPFrequencyLimit({ id: 'export-chat-logs', seconds: 1, limit: 1, force: true }),
  handler
);
