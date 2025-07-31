import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { addDays } from 'date-fns';
import { Types } from 'mongoose';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';
import { MongoAppChatLog } from '@fastgpt/service/core/app/logs/chatLogsSchema';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { getUserDetail } from '@fastgpt/service/support/user/controller';

export type getChartDataV2Query = {};

export type getChartDataV2Body = {
  appId: string;
  dateStart: Date;
  dateEnd: Date;
  source?: ChatSourceEnum[];
  offsetDays: number;
  userTimespan: 'day' | 'week' | 'month' | 'quarter';
  chatTimespan: 'day' | 'week' | 'month' | 'quarter';
  appTimespan: 'day' | 'week' | 'month' | 'quarter';
};

export type getChartDataV2Response = {
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

// 类型定义
type DailyStats = {
  date: Date;
  userCount: number;
  newUserCount: number;
  chatItemCount: number;
  chatCount: number;
  errorCount: number;
  totalPoints: number;
  goodFeedbackCount: number;
  badFeedbackCount: number;
  totalResponseTime: number;
  uniqueUsers: string[];
  retentionUserCount: number;
};

type RetentionData = {
  currentNewUsers: Array<{ _id: string; newUsers: string[] }>;
  futureActiveUsers: Array<{ _id: string; activeUsers: string[] }>;
};

type SourceUserData = {
  date: Date;
  source: string;
  userCount: number;
};

const createDateAggregationStage = (dateField: string, timezone: string) => ({
  $addFields: {
    localTime: {
      $dateToString: {
        format: '%Y-%m-%d',
        date: dateField,
        timezone
      }
    }
  }
});

const initializeSourceCountMap = (): Record<ChatSourceEnum, number> => {
  return Object.values(ChatSourceEnum).reduce(
    (acc, source) => {
      acc[source] = 0;
      return acc;
    },
    {} as Record<ChatSourceEnum, number>
  );
};

async function handler(
  req: ApiRequestProps<getChartDataV2Body, getChartDataV2Query>,
  res: ApiResponseType<any>
): Promise<getChartDataV2Response> {
  const {
    appId,
    dateStart: dateStartStr,
    dateEnd: dateEndStr,
    offsetDays = 1,
    source,

    userTimespan = 'day',
    chatTimespan = 'day',
    appTimespan = 'day'
  } = req.body;

  // 确保日期是 Date 对象
  const dateStart = dateStartStr ? new Date(dateStartStr) : addDays(new Date(), -7);
  const dateEnd = dateEndStr ? new Date(dateEndStr) : new Date();

  const { teamId, tmbId } = await authApp({ req, authToken: true, appId, per: WritePermissionVal });

  // 获取用户时区信息
  const userDetail = await getUserDetail({ tmbId });
  const userTimezone = userDetail.timezone || 'UTC';

  const baseMatch = {
    teamId: new Types.ObjectId(teamId),
    appId: new Types.ObjectId(appId)
  };

  // 执行并行聚合查询
  const [chatLogData, retentionData, sourceUserData] = await Promise.all([
    // 1. 获取每日统计数据
    getDailyStats(baseMatch, dateStart, dateEnd, userTimezone),
    // 2. 获取留存数据
    getRetentionData(baseMatch, dateStart, dateEnd, offsetDays, userTimezone),
    // 3. 获取渠道用户数据
    getSourceUserStats(baseMatch, dateStart, dateEnd, userTimezone)
  ]);

  console.log('=== 渠道用户数据分析 ===');
  console.log('原始数据条数:', sourceUserData.length);

  // 按日期分组查看
  const groupedByDate = sourceUserData.reduce(
    (acc, item) => {
      const dateKey = item.date.toISOString().split('T')[0];
      if (!acc[dateKey]) acc[dateKey] = [];
      acc[dateKey].push({
        source: item.source,
        userCount: item.userCount
      });
      return acc;
    },
    {} as Record<string, Array<{ source: string; userCount: number }>>
  );

  console.log('按日期分组的渠道数据:');
  Object.entries(groupedByDate).forEach(([date, sources]) => {
    console.log(`  ${date}:`, sources);
  });

  // 处理留存数据
  const retentionMap = processRetentionData(retentionData[0] as RetentionData);

  // 处理渠道数据
  const sourceMap = processSourceData(sourceUserData as SourceUserData[]);

  // 合并所有数据
  const processedData = chatLogData.map((item) => ({
    ...item,
    retentionUserCount: retentionMap.get(item.date.toISOString().split('T')[0]) || 0
  }));

  // 计算平均值
  const averages = calculateAverages(processedData);

  // 构建最终响应
  return {
    list: processedData.map((item) => {
      const dateKey = item.date.toISOString().split('T')[0];
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
          sourceCountMap: sourceMap.get(dateKey) || initializeSourceCountMap()
        }
      };
    }),
    ...averages
  };
}

// 获取每日统计数据
async function getDailyStats(
  baseMatch: object,
  dateStart: Date,
  dateEnd: Date,
  timezone: string
): Promise<DailyStats[]> {
  return MongoAppChatLog.aggregate(
    [
      {
        $match: {
          ...baseMatch,
          updateTime: {
            $gte: new Date(dateStart),
            $lte: new Date(dateEnd)
          }
        }
      },
      createDateAggregationStage('$updateTime', timezone),
      {
        $group: {
          _id: '$localTime',
          // 用户统计
          uniqueUsers: { $addToSet: '$userId' },
          newUsers: {
            $addToSet: {
              $cond: [{ $eq: ['$isFirstChat', true] }, '$userId', null]
            }
          },
          // 对话统计
          chatItemCount: { $sum: '$chatItemCount' },
          chatCount: { $sum: 1 },
          errorCount: { $sum: '$errorCount' },
          // 积分统计
          totalPoints: { $sum: '$totalPoints' },
          // 反馈统计
          goodFeedbackCount: { $sum: '$goodFeedbackCount' },
          badFeedbackCount: { $sum: '$badFeedbackCount' },
          // 响应时长统计
          totalResponseTime: { $sum: '$totalResponseTime' }
        }
      },
      {
        $project: {
          _id: 0,
          date: { $dateFromString: { dateString: '$_id' } },
          userCount: {
            $size: {
              $filter: {
                input: '$uniqueUsers',
                cond: { $ne: ['$$this', null] }
              }
            }
          },
          newUserCount: {
            $size: {
              $filter: {
                input: '$newUsers',
                cond: { $ne: ['$$this', null] }
              }
            }
          },
          chatItemCount: 1,
          chatCount: 1,
          errorCount: 1,
          totalPoints: 1,
          goodFeedbackCount: 1,
          badFeedbackCount: 1,
          totalResponseTime: 1,
          uniqueUsers: 1
        }
      },
      { $sort: { date: 1 } }
    ],
    readFromSecondary
  );
}

async function getRetentionData(
  baseMatch: object,
  dateStart: Date,
  dateEnd: Date,
  offsetDays: number,
  timezone: string
): Promise<any[]> {
  return MongoAppChatLog.aggregate(
    [
      {
        $facet: {
          currentNewUsers: [
            {
              $match: {
                ...baseMatch,
                isFirstChat: true,
                createTime: {
                  $gte: dateStart,
                  $lte: dateEnd
                }
              }
            },
            createDateAggregationStage('$createTime', timezone),
            {
              $group: {
                _id: '$localTime',
                newUsers: { $addToSet: '$userId' }
              }
            }
          ],
          futureActiveUsers: [
            {
              $match: {
                ...baseMatch,
                updateTime: {
                  $gte: new Date(dateStart.getTime() + offsetDays * 24 * 60 * 60 * 1000),
                  $lte: new Date(dateEnd.getTime() + offsetDays * 24 * 60 * 60 * 1000)
                }
              }
            },
            {
              $addFields: {
                originalDate: {
                  $dateSubtract: {
                    startDate: '$updateTime',
                    unit: 'day',
                    amount: offsetDays
                  }
                }
              }
            },
            createDateAggregationStage('$originalDate', timezone),
            {
              $group: {
                _id: '$localTime',
                activeUsers: { $addToSet: '$userId' }
              }
            }
          ]
        }
      }
    ],
    readFromSecondary
  );
}

// 处理留存数据
function processRetentionData(retentionInfo: RetentionData): Map<string, number> {
  const currentNewUsersMap = new Map<string, Set<string>>();
  const futureActiveUsersMap = new Map<string, Set<string>>();

  // 构建新增用户 Map
  retentionInfo.currentNewUsers.forEach((item) => {
    currentNewUsersMap.set(item._id, new Set(item.newUsers));
  });

  // 构建活跃用户 Map
  retentionInfo.futureActiveUsers.forEach((item) => {
    futureActiveUsersMap.set(item._id, new Set(item.activeUsers));
  });

  const retentionMap = new Map<string, number>();
  currentNewUsersMap.forEach((newUsers, dateKey) => {
    const activeUsers = futureActiveUsersMap.get(dateKey) || new Set();

    retentionMap.set(dateKey, Array.from(newUsers).filter((user) => activeUsers.has(user)).length);
  });

  return retentionMap;
}

// 获取渠道用户统计
async function getSourceUserStats(
  baseMatch: object,
  dateStart: Date,
  dateEnd: Date,
  timezone: string
): Promise<SourceUserData[]> {
  return MongoAppChatLog.aggregate(
    [
      {
        $match: {
          ...baseMatch,
          updateTime: {
            $gte: new Date(dateStart),
            $lte: new Date(dateEnd)
          }
        }
      },
      createDateAggregationStage('$updateTime', timezone),
      {
        $group: {
          _id: {
            date: '$localTime',
            source: '$source'
          },
          uniqueUsers: { $addToSet: '$userId' }
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
    readFromSecondary
  );
}

// 处理渠道数据
function processSourceData(
  sourceData: SourceUserData[]
): Map<string, Record<ChatSourceEnum, number>> {
  const sourceMap = new Map<string, Record<ChatSourceEnum, number>>();

  // 初始化每天的渠道统计
  const dates = new Set(sourceData.map((item) => item.date.toISOString().split('T')[0]));
  dates.forEach((date) => {
    sourceMap.set(date, initializeSourceCountMap());
  });

  // 填充渠道数据
  sourceData.forEach((item) => {
    const dateKey = item.date.toISOString().split('T')[0];
    const dailySourceMap = sourceMap.get(dateKey);
    if (
      dailySourceMap &&
      item.source &&
      Object.values(ChatSourceEnum).includes(item.source as ChatSourceEnum)
    ) {
      dailySourceMap[item.source as ChatSourceEnum] = item.userCount;
    }
  });

  return sourceMap;
}

// 计算平均值
function calculateAverages(data: DailyStats[]) {
  if (data.length === 0) {
    return {
      avgUserCount: 0,
      avgChatItemCount: 0,
      avgChatCount: 0,
      avgPoints: 0
    };
  }

  const totals = data.reduce(
    (acc, item) => ({
      userCount: acc.userCount + item.userCount,
      chatItemCount: acc.chatItemCount + item.chatItemCount,
      chatCount: acc.chatCount + item.chatCount,
      points: acc.points + (item.totalPoints || 0)
    }),
    { userCount: 0, chatItemCount: 0, chatCount: 0, points: 0 }
  );

  return {
    avgUserCount: Math.round((totals.userCount / data.length) * 100) / 100,
    avgChatItemCount: Math.round((totals.chatItemCount / data.length) * 100) / 100,
    avgChatCount: Math.round((totals.chatCount / data.length) * 100) / 100,
    avgPoints: Math.round((totals.points / data.length) * 100) / 100
  };
}

export default NextAPI(handler);
