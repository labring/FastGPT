import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { Types } from 'mongoose';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';
import { MongoAppChatLog } from '@fastgpt/service/core/app/logs/chatLogsSchema';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { getUserDetail } from '@fastgpt/service/support/user/controller';
import type {
  AppChatLogAppData,
  AppChatLogChatData,
  AppChatLogSchema,
  AppChatLogUserData
} from '@fastgpt/global/core/app/logs/type';
import { AppLogTimespanEnum } from '@fastgpt/global/core/app/logs/constants';
import { calculateOffsetDates } from '@fastgpt/global/core/app/logs/utils';

export type getChartDataV2Query = {};

export type getChartDataV2Body = {
  appId: string;
  dateStart: Date;
  dateEnd: Date;
  source?: ChatSourceEnum[];
  offset: number;
  userTimespan: AppLogTimespanEnum;
  chatTimespan: AppLogTimespanEnum;
  appTimespan: AppLogTimespanEnum;
};

export type getChartDataV2Response = {
  userData: AppChatLogUserData;
  chatData: AppChatLogChatData;
  appData: AppChatLogAppData;
};

type AggregatedStats = {
  date: Date;
  localTime?: string;
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
};

type SourceUserData = {
  date: Date;
  localTime?: string;
  source: string;
  userCount: number;
};

const createDateAggregationStage = (
  dateField: string,
  timezone: string,
  timespan: string = 'day'
) => {
  const dateAggregationConfig = {
    week: {
      $concat: [
        { $dateToString: { format: '%G', date: dateField, timezone } },
        '-W',
        { $dateToString: { format: '%V', date: dateField, timezone } }
      ]
    },
    month: { $dateToString: { format: '%Y-%m', date: dateField, timezone } },
    quarter: {
      $concat: [
        { $dateToString: { format: '%Y', date: dateField, timezone } },
        '-Q',
        { $toString: { $ceil: { $divide: [{ $month: { date: dateField, timezone } }, 3] } } }
      ]
    },
    day: { $dateToString: { format: '%Y-%m-%d', date: dateField, timezone } }
  };

  return {
    $addFields: {
      localTime:
        dateAggregationConfig[timespan as keyof typeof dateAggregationConfig] ||
        dateAggregationConfig.day
    }
  };
};

const initializeSourceCountMap = (): Record<ChatSourceEnum, number> => {
  return Object.values(ChatSourceEnum).reduce(
    (acc, source) => {
      acc[source] = 0;
      return acc;
    },
    {} as Record<ChatSourceEnum, number>
  );
};

const convertTimespanToTimestamp = (timespanStr: string, timespan: string): number => {
  switch (timespan) {
    case 'week': {
      const [year, weekNum] = timespanStr.split('-W').map(Number);
      const jan1 = new Date(year, 0, 1);
      const jan1Day = jan1.getDay() || 7;
      const daysToMonday = jan1Day === 1 ? 0 : 8 - jan1Day;
      const firstMonday = new Date(year, 0, 1 + daysToMonday);
      const targetMonday = new Date(firstMonday);
      targetMonday.setDate(firstMonday.getDate() + (weekNum - 1) * 7);
      return Math.floor(targetMonday.getTime() / 1000);
    }
    case 'month': {
      const [year, month] = timespanStr.split('-').map(Number);
      return Math.floor(new Date(year, month - 1, 1).getTime() / 1000);
    }
    case 'quarter': {
      const [year, quarter] = timespanStr.split('-Q').map(Number);
      const month = (quarter - 1) * 3;
      return Math.floor(new Date(year, month, 1).getTime() / 1000);
    }
    default: {
      return Math.floor(new Date(timespanStr).getTime() / 1000);
    }
  }
};

async function handler(
  req: ApiRequestProps<getChartDataV2Body, getChartDataV2Query>,
  res: ApiResponseType<any>
): Promise<getChartDataV2Response> {
  const {
    appId,
    dateStart: dateStartStr,
    dateEnd: dateEndStr,
    offset = 1,
    source,
    userTimespan,
    chatTimespan,
    appTimespan
  } = req.body;

  const dateStart = new Date(dateStartStr);
  const dateEnd = new Date(dateEndStr);

  const { teamId, tmbId } = await authApp({ req, authToken: true, appId, per: WritePermissionVal });

  const userDetail = await getUserDetail({ tmbId });
  const timezone = userDetail.timezone || 'UTC';

  const baseMatch: any = { teamId: new Types.ObjectId(teamId), appId: new Types.ObjectId(appId) };

  if (source && source.length > 0) {
    baseMatch.source = { $in: source };
  }

  const { offsetStart, offsetEnd } = calculateOffsetDates(dateStart, dateEnd, offset, userTimespan);

  const [rawData, retentionData, sourceUserData] = await Promise.all([
    MongoAppChatLog.aggregate(
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
        {
          $project: {
            updateTime: 1,
            userId: 1,
            isFirstChat: 1,
            chatItemCount: 1,
            errorCount: 1,
            totalPoints: 1,
            goodFeedbackCount: 1,
            badFeedbackCount: 1,
            totalResponseTime: 1,
            source: 1
          }
        }
      ],
      readFromSecondary
    ),
    MongoAppChatLog.aggregate(
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
              createDateAggregationStage('$createTime', timezone, userTimespan),
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
                    $gte: offsetStart,
                    $lte: offsetEnd
                  }
                }
              },
              {
                $addFields: {
                  originalDate: {
                    $dateSubtract: {
                      startDate: '$updateTime',
                      unit: userTimespan,
                      amount: userTimespan === AppLogTimespanEnum.quarter ? offset * 3 : offset
                    }
                  }
                }
              },
              createDateAggregationStage('$originalDate', timezone, userTimespan),
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
    ),
    MongoAppChatLog.aggregate(
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
        createDateAggregationStage('$updateTime', timezone, appTimespan),
        {
          $group: {
            _id: {
              date: '$localTime',
              source: '$source'
            },
            originalDate: { $first: '$updateTime' },
            uniqueUsers: { $addToSet: '$userId' }
          }
        },
        {
          $project: {
            _id: 0,
            localTime: '$_id.date',
            date: '$originalDate',
            source: '$_id.source',
            userCount: { $size: '$uniqueUsers' }
          }
        },
        { $sort: { date: 1, source: 1 } }
      ],
      readFromSecondary
    )
  ]);

  const userLogData = aggregateDataByTimespan(rawData, timezone, userTimespan);
  const chatLogData = aggregateDataByTimespan(rawData, timezone, chatTimespan);
  const appLogData = aggregateDataByTimespan(rawData, timezone, appTimespan);

  const retentionMap = (() => {
    const currentNewUsersMap = new Map<string, Set<string>>();
    const futureActiveUsersMap = new Map<string, Set<string>>();

    retentionData[0].currentNewUsers.forEach((item: { _id: string; newUsers: string[] }) => {
      currentNewUsersMap.set(item._id, new Set(item.newUsers));
    });
    retentionData[0].futureActiveUsers.forEach((item: { _id: string; activeUsers: string[] }) => {
      futureActiveUsersMap.set(item._id, new Set(item.activeUsers));
    });

    const retentionMap = new Map<string, number>();
    currentNewUsersMap.forEach((newUsers, dateKey) => {
      const activeUsers = futureActiveUsersMap.get(dateKey) || new Set();

      retentionMap.set(
        dateKey,
        Array.from(newUsers).filter((user) => activeUsers.has(user)).length
      );
    });

    return retentionMap;
  })();

  const sourceMap = (() => {
    const sourceMap = new Map<string, Record<ChatSourceEnum, number>>();
    const dates = new Set(
      sourceUserData.map((item) => item.localTime || item.date.toISOString().split('T')[0])
    );
    dates.forEach((date) => {
      sourceMap.set(date, initializeSourceCountMap());
    });
    sourceUserData.forEach((item) => {
      const dateKey = item.localTime || item.date.toISOString().split('T')[0];
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
  })();

  const userData = transformUserData(userLogData, userTimespan, retentionMap);
  const chatData = transformChatData(chatLogData, chatTimespan);
  const appData = transformAppData(appLogData, appTimespan, sourceMap);

  return { userData, chatData, appData };
}

function aggregateDataByTimespan(
  rawData: AppChatLogSchema[],
  timezone: string,
  timespan: AppLogTimespanEnum
) {
  const getDateKey = (date: Date): string => {
    const localDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
    const year = localDate.getFullYear();
    const month = localDate.getMonth();
    const day = localDate.getDate();

    if (timespan === AppLogTimespanEnum.week) {
      const weekStart = new Date(localDate);
      const dayOfWeek = weekStart.getDay();
      weekStart.setDate(day - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      const startStr = `${weekStart.getMonth() + 1}/${weekStart.getDate()}`;
      const endStr = `${weekEnd.getMonth() + 1}/${weekEnd.getDate()}`;
      return `${startStr}-${endStr}`;
    } else if (timespan === AppLogTimespanEnum.month) {
      return `${year}-${(month + 1).toString().padStart(2, '0')}`;
    } else if (timespan === AppLogTimespanEnum.quarter) {
      return `${year}-Q${Math.ceil((month + 1) / 3)}`;
    } else {
      return `${year}-${(month + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    }
  };

  const groups = rawData.reduce<Record<string, any>>((acc, item) => {
    const itemDate = new Date(item.updateTime);
    const key = getDateKey(itemDate);

    if (!acc[key]) {
      const representativeDate = (() => {
        if (timespan === AppLogTimespanEnum.week) {
          return (date: Date) => {
            const localDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
            const dayOfWeek = localDate.getDay();
            const monday = new Date(localDate);
            monday.setDate(localDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));
            monday.setHours(0, 0, 0, 0);
            return monday;
          };
        } else if (timespan === AppLogTimespanEnum.month) {
          return (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
        } else if (timespan === AppLogTimespanEnum.quarter) {
          return (date: Date) => {
            const quarter = Math.floor(date.getMonth() / 3);
            return new Date(date.getFullYear(), quarter * 3, 1);
          };
        } else {
          return (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
        }
      })();

      acc[key] = {
        date: representativeDate,
        users: new Set<string>(),
        newUsers: new Set<string>(),
        stats: {
          chatItemCount: 0,
          chatCount: 0,
          errorCount: 0,
          totalPoints: 0,
          goodFeedbackCount: 0,
          badFeedbackCount: 0,
          totalResponseTime: 0
        }
      };
    }

    const group = acc[key];
    if (item.userId) {
      group.users.add(item.userId);
      if (item.isFirstChat) group.newUsers.add(item.userId);
    }

    group.stats.chatItemCount += item.chatItemCount || 0;
    group.stats.chatCount += 1;
    group.stats.errorCount += item.errorCount || 0;
    group.stats.totalPoints += item.totalPoints || 0;
    group.stats.goodFeedbackCount += item.goodFeedbackCount || 0;
    group.stats.badFeedbackCount += item.badFeedbackCount || 0;
    group.stats.totalResponseTime += item.totalResponseTime || 0;

    return acc;
  }, {});

  return Object.entries(groups)
    .map(([localTime, data]) => ({
      date: data.date,
      localTime,
      userCount: data.users.size,
      newUserCount: data.newUsers.size,
      uniqueUsers: Array.from(data.users),
      ...data.stats
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

function transformUserData(
  data: AggregatedStats[],
  timespan: AppLogTimespanEnum,
  retentionMap: Map<string, number>
) {
  return data.map((item) => {
    const localTime = item.localTime || item.date.toISOString().split('T')[0];
    const timestamp =
      timespan !== AppLogTimespanEnum.day
        ? convertTimespanToTimestamp(localTime, timespan)
        : Math.floor(item.date.getTime() / 1000);

    const retentionDateKey = item.date.toISOString().split('T')[0];
    const retentionUserCount = retentionMap.get(retentionDateKey) || 0;

    return {
      timestamp,
      summary: {
        userCount: item.userCount,
        newUserCount: item.newUserCount,
        retentionUserCount,
        points: item.totalPoints || 0
      }
    };
  });
}

function transformChatData(data: AggregatedStats[], timespan: AppLogTimespanEnum) {
  return data.map((item) => {
    const localTime = item.localTime || item.date.toISOString().split('T')[0];
    const timestamp =
      timespan !== AppLogTimespanEnum.day
        ? convertTimespanToTimestamp(localTime, timespan)
        : Math.floor(item.date.getTime() / 1000);

    return {
      timestamp,
      summary: {
        chatItemCount: item.chatItemCount,
        chatCount: item.chatCount,
        errorCount: item.errorCount,
        points: item.totalPoints || 0
      }
    };
  });
}

function transformAppData(
  data: AggregatedStats[],
  timespan: AppLogTimespanEnum,
  sourceMap: Map<string, Record<ChatSourceEnum, number>>
) {
  return data.map((item) => {
    const localTime = item.localTime || item.date.toISOString().split('T')[0];
    const timestamp =
      timespan !== AppLogTimespanEnum.day
        ? convertTimespanToTimestamp(localTime, timespan)
        : Math.floor(item.date.getTime() / 1000);

    const dateKey =
      timespan === AppLogTimespanEnum.day ? item.date.toISOString().split('T')[0] : localTime;

    return {
      timestamp,
      summary: {
        goodFeedBackCount: item.goodFeedbackCount || 0,
        badFeedBackCount: item.badFeedbackCount || 0,
        totalResponseTime: item.totalResponseTime || 0,
        sourceCountMap: sourceMap.get(dateKey) || initializeSourceCountMap()
      }
    };
  });
}

export default NextAPI(handler);
