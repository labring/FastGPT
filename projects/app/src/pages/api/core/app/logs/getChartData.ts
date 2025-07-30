import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { addDays } from 'date-fns';
import { Types } from 'mongoose';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { getMongoTimezoneCode } from '@fastgpt/global/common/time/timezone';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';

export type getChartDataQuery = {};

export type getChartDataBody = {
  appId: string;

  dateStart: Date;
  dateEnd: Date;

  offsetDays: number;

  userTimespan: 'day' | 'week' | 'month' | 'quarter';
  chatTimespan: 'day' | 'week' | 'month' | 'quarter';
  appTimespan: 'day' | 'week' | 'month' | 'quarter';
};

export type getChartDataResponse = {
  list: {
    timestamp: number;
    summary: {
      // user
      userCount: number; // 当日活跃用户数
      newUserCount: number; // 新增用户数
      retentionUserCount: number; // 留存用户数
      points: number; // 积分消耗

      // chat
      chatItemCount: number; // 对话次数
      chatCount: number; // 会话次数
      errorCount: number; // 错误次数

      // callback
      goodFeedBackCount: number; // 点赞数
      badFeedBackCount: number; // 点踩数
      totalResponseTime: number; // 总响应时长

      // source
      sourceCountMap: Record<ChatSourceEnum, number>; // 渠道用户数
    };
  }[];
  avgUserCount: number;
  avgChatItemCount: number;
  avgChatCount: number;
  avgPoints: number;
};

async function handler(
  req: ApiRequestProps<getChartDataBody, getChartDataQuery>,
  res: ApiResponseType<any>
): Promise<getChartDataResponse> {
  const {
    appId,

    dateStart = addDays(new Date(), -7),
    dateEnd = new Date(),

    offsetDays = 7,

    userTimespan = 'day',
    chatTimespan = 'day',
    appTimespan = 'day'
  } = req.body;

  const { teamId } = await authApp({ req, authToken: true, appId, per: WritePermissionVal });

  const where = {
    teamId: new Types.ObjectId(teamId),
    appId: new Types.ObjectId(appId)
  };

  // 获取时区信息
  const timezone = getMongoTimezoneCode(dateStart.toString());

  // 计算offsetDays之前的日期
  const offsetDateStart = new Date(dateStart);
  const offsetDateEnd = new Date(dateEnd);
  offsetDateStart.setDate(offsetDateStart.getDate() - offsetDays);
  offsetDateEnd.setDate(offsetDateEnd.getDate() - offsetDays);

  const offsetWhere = {
    teamId: new Types.ObjectId(teamId),
    appId: new Types.ObjectId(appId),
    updateTime: {
      $gte: new Date(offsetDateStart),
      $lt: new Date(offsetDateEnd)
    }
  };

  // 分别查询对话数据、当前用户数据、历史用户数据、渠道用户数据
  const [chatData, userData, historyUserData, sourceUserData] = await Promise.all([
    // 从 MongoChatItem 获取对话统计
    MongoChatItem.aggregate(
      [
        {
          $match: {
            ...where,
            time: {
              $gte: new Date(dateStart),
              $lte: new Date(dateEnd)
            }
          }
        },
        {
          $addFields: {
            localTime: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$time',
                timezone
              }
            }
          }
        },
        {
          $group: {
            _id: '$localTime',
            chatItemCount: {
              $sum: {
                $cond: [{ $eq: ['$obj', 'AI'] }, 1, 0]
              }
            }, // 对话次数
            uniqueChats: {
              $addToSet: '$chatId'
            },
            errorCount: {
              $sum: {
                $cond: [{ $ifNull: ['$errorMsg', false] }, 1, 0]
              }
            },
            // 积分消耗统计
            totalPoints: {
              $sum: {
                $reduce: {
                  input: { $ifNull: ['$responseData', []] },
                  initialValue: 0,
                  in: {
                    $add: ['$$value', { $ifNull: ['$$this.totalPoints', 0] }]
                  }
                }
              }
            },
            // 点赞数统计
            goodFeedbackCount: {
              $sum: {
                $cond: [{ $ifNull: ['$userGoodFeedback', false] }, 1, 0]
              }
            },
            // 点踩数统计
            badFeedbackCount: {
              $sum: {
                $cond: [{ $ifNull: ['$userBadFeedback', false] }, 1, 0]
              }
            },
            // 响应时长统计
            totalResponseTime: {
              $sum: {
                $cond: [{ $eq: ['$obj', 'AI'] }, { $ifNull: ['$durationSeconds', 0] }, 0]
              }
            }
          }
        },
        {
          $project: {
            _id: 0,
            date: { $dateFromString: { dateString: '$_id' } },
            chatItemCount: 1,
            chatCount: { $size: '$uniqueChats' }, // 会话次数
            errorCount: 1,
            totalPoints: 1,
            goodFeedbackCount: 1,
            badFeedbackCount: 1,
            totalResponseTime: 1
          }
        },
        { $sort: { date: 1 } }
      ],
      {
        ...readFromSecondary
      }
    ),
    // 从 MongoChat 获取当前时间段的用户统计
    MongoChat.aggregate(
      [
        {
          $match: {
            ...where,
            updateTime: {
              $gte: new Date(dateStart),
              $lte: new Date(dateEnd)
            }
          }
        },
        {
          $addFields: {
            localTime: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$updateTime',
                timezone
              }
            }
          }
        },
        {
          $group: {
            _id: '$localTime',
            uniqueUsers: {
              $addToSet: {
                $ifNull: [
                  {
                    $cond: [{ $ne: ['$outLinkUid', ''] }, '$outLinkUid', null]
                  },
                  '$tmbId'
                ]
              }
            }
          }
        },
        {
          $project: {
            _id: 0,
            date: { $dateFromString: { dateString: '$_id' } },
            userCount: { $size: '$uniqueUsers' },
            uniqueUsers: 1
          }
        },
        { $sort: { date: 1 } }
      ],
      {
        ...readFromSecondary
      }
    ),
    // 从 MongoChat 获取当前时段之前的所有历史用户数据
    MongoChat.aggregate(
      [
        {
          $match: {
            ...where,
            updateTime: {
              $lt: new Date(dateStart)
            }
          }
        },
        {
          $group: {
            _id: null,
            historyUsers: {
              $addToSet: {
                $ifNull: [
                  {
                    $cond: [{ $ne: ['$outLinkUid', ''] }, '$outLinkUid', null]
                  },
                  '$tmbId'
                ]
              }
            }
          }
        }
      ],
      {
        ...readFromSecondary
      }
    ),
    // 从 MongoChat 获取按天和渠道的用户统计
    MongoChat.aggregate(
      [
        {
          $match: {
            ...where,
            updateTime: {
              $gte: new Date(dateStart),
              $lte: new Date(dateEnd)
            }
          }
        },
        {
          $addFields: {
            localTime: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$updateTime',
                timezone
              }
            }
          }
        },
        {
          $group: {
            _id: {
              date: '$localTime',
              source: '$source'
            },
            uniqueUsers: {
              $addToSet: {
                $ifNull: [
                  {
                    $cond: [{ $ne: ['$outLinkUid', ''] }, '$outLinkUid', null]
                  },
                  '$tmbId'
                ]
              }
            }
          }
        },
        {
          $project: {
            _id: 0,
            date: { $dateFromString: { dateString: '$_id.date' } },
            source: '$_id.source',
            userCount: { $size: '$uniqueUsers' }
          }
        },
        { $sort: { date: 1, source: 1 } }
      ],
      {
        ...readFromSecondary
      }
    )
  ]);

  // 获取历史用户集合（当前查询时段之前的所有用户）
  const historyUsers = new Set(historyUserData.length > 0 ? historyUserData[0].historyUsers : []);

  // 合并对话数据和用户数据
  const mergedData = chatData.map((chatItem) => {
    const userItem = userData.find((user) => user.date.getTime() === chatItem.date.getTime());

    return {
      ...chatItem,
      userCount: userItem?.userCount || 0,
      uniqueUsers: userItem?.uniqueUsers || []
    };
  });

  // 计算新增用户和留存用户
  const processedData = mergedData.map((item) => {
    const currentUsers = new Set(item.uniqueUsers);

    // 新增用户：当前时间段有但历史记录中没有的用户
    const newUserCount = Array.from(currentUsers).filter((user) => !historyUsers.has(user)).length;

    // 留存用户：当前时间段有且是历史用户
    // const retentionUserCount = Array.from(currentUsers).filter((user) =>
    //   historyUsers.has(user)
    // ).length;

    // 将当天的新增用户加入历史用户集合（用于下一天的计算）
    currentUsers.forEach((user) => {
      if (!historyUsers.has(user)) {
        historyUsers.add(user);
      }
    });

    return {
      ...item,
      newUserCount,
      retentionUserCount: 0
    };
  });

  // 计算平均值
  const totalChatItemCount = processedData.reduce((sum, item) => sum + item.chatItemCount, 0);
  const totalChatCount = processedData.reduce((sum, item) => sum + item.chatCount, 0);
  const totalUserCount = processedData.reduce((sum, item) => sum + item.userCount, 0);
  const totalPoints = processedData.reduce((sum, item) => sum + (item.totalPoints || 0), 0);
  const avgChatItemCount = processedData.length > 0 ? totalChatItemCount / processedData.length : 0;
  const avgChatCount = processedData.length > 0 ? totalChatCount / processedData.length : 0;
  const avgUserCount = processedData.length > 0 ? totalUserCount / processedData.length : 0;
  const avgPoints = processedData.length > 0 ? totalPoints / processedData.length : 0;

  // 按天构建渠道用户数统计
  const dailySourceData = new Map<string, Record<ChatSourceEnum, number>>();

  // 初始化每天的渠道用户数统计
  processedData.forEach((item) => {
    const dateKey = item.date.toISOString().split('T')[0];
    dailySourceData.set(
      dateKey,
      Object.values(ChatSourceEnum).reduce(
        (acc, source) => {
          acc[source] = 0;
          return acc;
        },
        {} as Record<ChatSourceEnum, number>
      )
    );
  });

  // 填充每天的渠道用户数
  sourceUserData.forEach((item) => {
    const dateKey = item.date.toISOString().split('T')[0];
    const dailySourceMap = dailySourceData.get(dateKey);
    if (
      dailySourceMap &&
      item.source &&
      Object.values(ChatSourceEnum).includes(item.source as ChatSourceEnum)
    ) {
      dailySourceMap[item.source as ChatSourceEnum] = item.userCount;
    }
  });

  return {
    list: processedData.map((item) => {
      const dateKey = item.date.toISOString().split('T')[0];
      const dailySourceMap =
        dailySourceData.get(dateKey) ||
        Object.values(ChatSourceEnum).reduce(
          (acc, source) => {
            acc[source] = 0;
            return acc;
          },
          {} as Record<ChatSourceEnum, number>
        );

      return {
        timestamp: Math.floor(item.date.getTime() / 1000),
        summary: {
          // user
          userCount: item.userCount,
          newUserCount: item.newUserCount,
          retentionUserCount: item.retentionUserCount,
          points: item.totalPoints || 0,

          // chat
          chatItemCount: item.chatItemCount,
          chatCount: item.chatCount,
          errorCount: item.errorCount,

          // callback
          goodFeedBackCount: item.goodFeedbackCount || 0,
          badFeedBackCount: item.badFeedbackCount || 0,
          totalResponseTime: item.totalResponseTime || 0,

          // source
          sourceCountMap: dailySourceMap
        }
      };
    }),
    avgUserCount: Math.round(avgUserCount * 100) / 100,
    avgChatItemCount: Math.round(avgChatItemCount * 100) / 100,
    avgChatCount: Math.round(avgChatCount * 100) / 100,
    avgPoints: Math.round(avgPoints * 100) / 100
  };
}

export default NextAPI(handler);
