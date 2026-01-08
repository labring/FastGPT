import { z } from 'zod';
import { PaginationSchema } from '../../../api';
import { AppLogKeysEnum, AppLogTimespanEnum } from '../../../../core/app/logs/constants';
import { ChatSourceEnum } from '../../../../core/chat/constants';
import { AppLogKeysSchema } from '../../../../core/app/logs/type';
import { SourceMemberSchema } from '../../../../support/user/type';

/* Log key mange */
export const GetLogKeysQuerySchema = z.object({
  appId: z.string().meta({ example: '68ad85a7463006c963799a05', description: '应用 ID' })
});
export type getLogKeysQuery = z.infer<typeof GetLogKeysQuerySchema>;

export const GetLogKeysResponseSchema = z.object({
  logKeys: z
    .array(AppLogKeysSchema)
    .default([])
    .meta({ example: [AppLogKeysEnum.SOURCE, AppLogKeysEnum.CREATED_TIME], description: '日志键' })
});
export type getLogKeysResponseType = z.infer<typeof GetLogKeysResponseSchema>;

export const UpdateLogKeysBodySchema = z.object({
  appId: z.string().meta({ example: '68ad85a7463006c963799a05', description: '应用 ID' }),
  logKeys: z
    .array(AppLogKeysSchema)
    .meta({ example: [AppLogKeysEnum.SOURCE, AppLogKeysEnum.CREATED_TIME], description: '日志键' })
});
export type updateLogKeysBody = z.infer<typeof UpdateLogKeysBodySchema>;

// Chat Log Item Schema (based on AppChatLogSchema)
export const ChatLogItemSchema = z.object({
  _id: z.string().meta({ example: '68ad85a7463006c963799a05', description: '对话日志 ID' }),
  chatId: z.string().meta({ example: 'chat123', description: '对话 ID' }),
  title: z.string().nullish().meta({ example: '用户对话', description: '对话标题' }),
  customTitle: z.string().nullish().meta({ example: '自定义标题', description: '自定义对话标题' }),
  source: z.enum(ChatSourceEnum).meta({ example: ChatSourceEnum.api, description: '对话来源' }),
  sourceName: z.string().nullish().meta({ example: 'API调用', description: '来源名称' }),
  updateTime: z.date().meta({ example: '2024-01-01T00:30:00.000Z', description: '更新时间' }),
  createTime: z
    .date()
    .nullish()
    .meta({ example: '2024-01-01T00:00:00.000Z', description: '创建时间' }),
  messageCount: z.int().nullish().meta({ example: 10, description: '消息数量' }),
  userGoodFeedbackCount: z.int().nullish().meta({ example: 3, description: '好评反馈数量' }),
  userBadFeedbackCount: z.int().nullish().meta({ example: 1, description: '差评反馈数量' }),
  customFeedbacksCount: z.int().nullish().meta({ example: 2, description: '自定义反馈数量' }),
  markCount: z.int().nullish().meta({ example: 0, description: '标记数量' }),
  averageResponseTime: z
    .number()
    .nullish()
    .meta({ example: 1500, description: '平均响应时间(毫秒)' }),
  errorCount: z.int().nullish().meta({ example: 0, description: '错误次数' }),
  totalPoints: z.number().nullish().meta({ example: 150.5, description: '总积分消耗' }),
  outLinkUid: z.string().nullish().meta({ example: 'outLink123', description: '外链用户 ID' }),
  tmbId: z.string().nullish().meta({ example: 'tmb123', description: '团队成员 ID' }),
  sourceMember: SourceMemberSchema.nullish().meta({ description: '来源成员信息' }),
  versionName: z.string().nullish().meta({ example: 'v1.0.0', description: '版本名称' }),
  originIp: z.string().nullish().meta({ example: '192.168.1.1', description: '原始 IP 地址' }),
  region: z.string().nullish().meta({ example: '中国', description: '区域' })
});
export type AppLogsListItemType = z.infer<typeof ChatLogItemSchema>;

/* Get chat logs */
const FeedbackLogParamSchema = z.object({
  feedbackType: z.enum(['all', 'has_feedback', 'good', 'bad']).optional().meta({
    example: 'good',
    description: '反馈类型：all-全部记录，has_feedback-包含反馈，good-包含赞，bad-包含踩'
  }),
  unreadOnly: z.boolean().optional().meta({
    example: false,
    description: '是否仅显示未读反馈（当 feedbackType 为 all 时忽略）'
  })
});
// Get App Chat Logs Query Parameters (based on GetAppChatLogsProps)
export const GetAppChatLogsBodySchema = PaginationSchema.extend(
  FeedbackLogParamSchema.shape
).extend({
  appId: z.string().meta({
    example: '68ad85a7463006c963799a05',
    description: '应用 ID'
  }),
  dateStart: z.union([z.string(), z.date()]).meta({
    example: '2024-01-01T00:00:00.000Z',
    description: '开始时间'
  }),
  dateEnd: z.union([z.string(), z.date()]).meta({
    example: '2024-12-31T23:59:59.999Z',
    description: '结束时间'
  }),
  sources: z
    .array(z.nativeEnum(ChatSourceEnum))
    .optional()
    .meta({
      example: [ChatSourceEnum.api, ChatSourceEnum.online],
      description: '对话来源筛选'
    }),
  tmbIds: z
    .array(z.string())
    .optional()
    .meta({
      example: ['tmb123', 'tmb456'],
      description: '团队成员 ID 列表'
    }),
  chatSearch: z.string().optional().meta({
    example: 'hello',
    description: '对话内容搜索关键词'
  })
});
export type getAppChatLogsBody = z.infer<typeof GetAppChatLogsBodySchema>;
// Get App Chat Logs Response
export const GetAppChatLogsResponseSchema = z
  .object({
    total: z.number().meta({ example: 100, description: '总记录数' }),
    list: z.array(ChatLogItemSchema)
  })
  .meta({ example: { total: 100, list: [] }, description: '应用对话日志列表' });
export type getAppChatLogsResponseType = z.infer<typeof GetAppChatLogsResponseSchema>;

/* Export chat log */
export const ExportChatLogsBodySchema = GetAppChatLogsBodySchema.omit({
  pageSize: true,
  offset: true,
  pageNum: true
}).safeExtend({
  title: z.string().meta({
    example: 'chat logs',
    description: '标题'
  }),
  sourcesMap: z.record(z.string(), z.object({ label: z.string() })).meta({
    example: { api: { label: 'API' }, online: { label: '在线' } },
    description: '来源映射'
  }),
  logKeys: z.array(z.enum(AppLogKeysEnum)).meta({
    example: [AppLogKeysEnum.SOURCE, AppLogKeysEnum.CREATED_TIME],
    description: '日志键'
  })
});

/* Get chart data */
// Get Chart Data Request Body (based on getChartDataBody)
export const GetChartDataBodySchema = z.object({
  appId: z.string().meta({
    example: '68ad85a7463006c963799a05',
    description: '应用 ID'
  }),
  dateStart: z.date().meta({
    example: '2024-01-01T00:00:00.000Z',
    description: '开始日期'
  }),
  dateEnd: z.date().meta({
    example: '2024-12-31T23:59:59.999Z',
    description: '结束日期'
  }),
  source: z
    .array(z.nativeEnum(ChatSourceEnum))
    .optional()
    .meta({
      example: [ChatSourceEnum.api, ChatSourceEnum.online],
      description: '对话来源筛选'
    }),
  offset: z.number().meta({
    example: 1,
    description: '时区偏移量'
  }),
  userTimespan: z.nativeEnum(AppLogTimespanEnum).meta({
    example: AppLogTimespanEnum.day,
    description: '用户数据时间跨度'
  }),
  chatTimespan: z.nativeEnum(AppLogTimespanEnum).meta({
    example: AppLogTimespanEnum.day,
    description: '对话数据时间跨度'
  }),
  appTimespan: z.nativeEnum(AppLogTimespanEnum).meta({
    example: AppLogTimespanEnum.day,
    description: '应用数据时间跨度'
  })
});
export type getChartDataBody = z.infer<typeof GetChartDataBodySchema>;

// User Statistics Data Point (based on AppChatLogUserData)
export const UserStatsDataPointSchema = z.object({
  timestamp: z.number().meta({ example: 1704067200, description: '时间戳' }),
  summary: z.object({
    userCount: z.number().meta({ example: 100, description: '用户总数' }),
    newUserCount: z.number().meta({ example: 30, description: '新用户数' }),
    retentionUserCount: z.number().meta({ example: 70, description: '留存用户数' }),
    points: z.number().meta({ example: 1500, description: '积分消耗' }),
    sourceCountMap: z.record(z.string(), z.number()).meta({
      example: { api: 50, web: 30, mobile: 20 },
      description: '各来源用户数量'
    })
  })
});
export type userStatsDataPoint = z.infer<typeof UserStatsDataPointSchema>;

// Chat Statistics Data Point (based on AppChatLogChatData)
export const ChatStatsDataPointSchema = z.object({
  timestamp: z.number().meta({ example: 1704067200, description: '时间戳' }),
  summary: z.object({
    chatItemCount: z.number().meta({ example: 500, description: '对话项目总数' }),
    chatCount: z.number().meta({ example: 100, description: '对话会话总数' }),
    errorCount: z.number().meta({ example: 5, description: '错误次数' }),
    points: z.number().meta({ example: 800, description: '积分消耗' })
  })
});
export type chatStatsDataPoint = z.infer<typeof ChatStatsDataPointSchema>;

// App Statistics Data Point (based on AppChatLogAppData)
export const AppStatsDataPointSchema = z.object({
  timestamp: z.number().meta({ example: 1704067200, description: '时间戳' }),
  summary: z.object({
    goodFeedBackCount: z.number().meta({ example: 25, description: '好评反馈数量' }),
    badFeedBackCount: z.number().meta({ example: 3, description: '差评反馈数量' }),
    chatCount: z.number().meta({ example: 100, description: '对话数量' }),
    totalResponseTime: z.number().meta({ example: 120000, description: '总响应时间(毫秒)' })
  })
});
export type appStatsDataPoint = z.infer<typeof AppStatsDataPointSchema>;

// Get Chart Data Response (based on getChartDataResponse)
export const GetChartDataResponseSchema = z.object({
  userData: z.array(UserStatsDataPointSchema).meta({ description: '用户统计数据' }),
  chatData: z.array(ChatStatsDataPointSchema).meta({ description: '对话统计数据' }),
  appData: z.array(AppStatsDataPointSchema).meta({ description: '应用统计数据' })
});
export type getChartDataResponse = z.infer<typeof GetChartDataResponseSchema>;

// Get Total Data Query Parameters (based on getTotalDataQuery)
export const GetTotalDataQuerySchema = z.object({
  appId: z.string().meta({
    example: '68ad85a7463006c963799a05',
    description: '应用 ID'
  })
});
export type getTotalDataQuery = z.infer<typeof GetTotalDataQuerySchema>;

// Get Total Data Response (based on getTotalDataResponse)
export const GetTotalDataResponseSchema = z.object({
  totalUsers: z.number().meta({
    example: 1000,
    description: '总用户数'
  }),
  totalChats: z.number().meta({
    example: 5000,
    description: '总对话数'
  }),
  totalPoints: z.number().meta({
    example: 15000,
    description: '总积分消耗'
  })
});
export type getTotalDataResponse = z.infer<typeof GetTotalDataResponseSchema>;
