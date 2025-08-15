import type { NextApiResponse } from 'next';
import { responseWriteController } from '@fastgpt/service/common/response';
import { addDays } from 'date-fns';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';
import { addLog } from '@fastgpt/service/common/system/log';
import dayjs from 'dayjs';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { NextAPI } from '@/service/middleware/entry';
import { useIPFrequencyLimit } from '@fastgpt/service/common/middle/reqFrequencyLimit';
import { type GetAppChatLogsProps } from '@/global/core/api/appReq';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { Types } from 'mongoose';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { ChatItemCollectionName } from '@fastgpt/service/core/chat/chatItemSchema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { type ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { AppLogKeysEnum } from '@fastgpt/global/core/app/logs/constants';
import { sanitizeCsvField } from '@fastgpt/service/common/file/csv';
import { AppReadChatLogPerVal } from '@fastgpt/global/support/permission/app/constant';
import { addAuditLog, getI18nAppType } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

const formatJsonString = (data: any) => {
  if (data == null) return '';
  return JSON.stringify(data).replace(/\n/g, '\\n');
};

export type ExportChatLogsBody = GetAppChatLogsProps & {
  title: string;
  sourcesMap: Record<string, { label: string }>;
  logKeys: AppLogKeysEnum[];
};

async function handler(req: ApiRequestProps<ExportChatLogsBody, {}>, res: NextApiResponse) {
  let {
    appId,
    dateStart = addDays(new Date(), -7),
    dateEnd = new Date(),
    sources,
    tmbIds,
    chatSearch,
    title,
    sourcesMap,
    logKeys = []
  } = req.body;

  if (!appId) {
    throw new Error('缺少参数');
  }

  const { teamId, tmbId, app } = await authApp({
    req,
    authToken: true,
    appId,
    per: AppReadChatLogPerVal
  });

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
    updateTime: {
      $gte: new Date(dateStart),
      $lte: new Date(dateEnd)
    },
    ...(sources && { source: { $in: sources } }),
    ...(tmbIds && { tmbId: { $in: tmbIds } }),
    ...(chatSearch && {
      $or: [
        { chatId: { $regex: new RegExp(`${replaceRegChars(chatSearch)}`, 'i') } },
        { title: { $regex: new RegExp(`${replaceRegChars(chatSearch)}`, 'i') } },
        { customTitle: { $regex: new RegExp(`${replaceRegChars(chatSearch)}`, 'i') } }
      ]
    })
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
            {
              $group: {
                _id: null,
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
                }
              }
            }
          ],
          as: 'chatItemsData'
        }
      },
      {
        $lookup: {
          from: ChatItemCollectionName,
          let: { chatId: '$chatId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$appId', new Types.ObjectId(appId)] },
                    { $eq: ['$chatId', '$$chatId'] }
                  ]
                }
              }
            },
            { $sort: { _id: 1 } },
            {
              $project: {
                value: 1,
                userGoodFeedback: 1,
                userBadFeedback: 1,
                customFeedbacks: 1,
                adminFeedback: 1
              }
            }
          ],
          as: 'chatitems'
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
          errorCount: { $ifNull: [{ $arrayElemAt: ['$chatItemsData.errorCount', 0] }, 0] },
          totalPoints: { $ifNull: [{ $arrayElemAt: ['$chatItemsData.totalPoints', 0] }, 0] },
          userGoodFeedbackItems: {
            $filter: {
              input: '$chatitems',
              as: 'item',
              cond: { $ifNull: ['$$item.userGoodFeedback', false] }
            }
          },
          userBadFeedbackItems: {
            $filter: {
              input: '$chatitems',
              as: 'item',
              cond: { $ifNull: ['$$item.userBadFeedback', false] }
            }
          },
          customFeedbackItems: {
            $filter: {
              input: '$chatitems',
              as: 'item',
              cond: { $gt: [{ $size: { $ifNull: ['$$item.customFeedbacks', []] } }, 0] }
            }
          },
          markItems: {
            $filter: {
              input: '$chatitems',
              as: 'item',
              cond: { $ifNull: ['$$item.adminFeedback', false] }
            }
          },
          chatDetails: {
            $map: {
              input: { $slice: ['$chatitems', -1000] },
              as: 'item',
              in: {
                id: '$$item._id',
                value: '$$item.value'
              }
            }
          }
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
          userGoodFeedbackItems: 1,
          userBadFeedbackItems: 1,
          customFeedbackItems: 1,
          markItems: 1,
          chatDetails: 1
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

  write(`\uFEFF${title}`);

  cursor.on('data', (doc) => {
    const createdTime = doc.createTime
      ? dayjs(doc.createTime.toISOString()).format('YYYY-MM-DD HH:mm:ss')
      : '';
    const lastConversationTime = doc.updateTime
      ? dayjs(doc.updateTime.toISOString()).format('YYYY-MM-DD HH:mm:ss')
      : '';
    const source = sourcesMap[doc.source as ChatSourceEnum]?.label || doc.source;
    const titleStr = doc.customTitle || doc.title || '';
    const tmbName = doc.outLinkUid
      ? doc.outLinkUid
      : teamMemberWithContact.find((member) => String(member.memberId) === String(doc.tmbId))?.name;

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
      chatDetails: () => formatJsonString(doc.chatDetails || [])
    };

    const row = [...logKeys, 'chatDetails']
      .map((key) => {
        const getter = valueMap[key];
        const val = getter ? getter() : '';
        return sanitizeCsvField(val ?? '');
      })
      .join(',');

    write(`\n${row}`);
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
  useIPFrequencyLimit({ id: 'export-chat-logs', seconds: 60, limit: 1, force: true }),
  handler
);
