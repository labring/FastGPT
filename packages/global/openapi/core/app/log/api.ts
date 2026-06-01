import z from 'zod';
import { PaginationSchema } from '../../../api';
import { AppLogKeysEnum, AppLogTimespanEnum } from '../../../../core/app/logs/constants';
import { ChatSourceEnum } from '../../../../core/chat/constants';
import { AppLogKeysSchema } from '../../../../core/app/logs/type';
import { SourceMemberSchema } from '../../../../support/user/type';
import { BoolSchema, IntSchema, NumSchema } from '../../../../common/zod';

const AppLogKeysItemSchema = AppLogKeysSchema.meta({
  description: '应用日志列配置'
});

/* Log key mange */
export const GetLogKeysQuerySchema = z.object({
  appId: z.string().meta({ example: '68ad85a7463006c963799a05', description: '应用 ID' })
});
export type getLogKeysQuery = z.infer<typeof GetLogKeysQuerySchema>;

export const GetLogKeysResponseSchema = z.object({
  logKeys: z
    .array(AppLogKeysItemSchema)
    .default([])
    .meta({
      example: [
        {
          key: AppLogKeysEnum.SOURCE,
          enable: true
        },
        {
          key: AppLogKeysEnum.CREATED_TIME,
          enable: true
        }
      ],
      description: '日志键'
    })
});
export type getLogKeysResponseType = z.infer<typeof GetLogKeysResponseSchema>;

export const UpdateLogKeysBodySchema = z.object({
  appId: z.string().meta({ example: '68ad85a7463006c963799a05', description: '应用 ID' }),
  logKeys: z.array(AppLogKeysItemSchema).meta({
    example: [
      {
        key: AppLogKeysEnum.SOURCE,
        enable: true
      }
    ],
    description: '日志键'
  })
});
export type updateLogKeysBody = z.infer<typeof UpdateLogKeysBodySchema>;

export const UpdateLogKeysResponseSchema = z.undefined().meta({
  description: '更新成功'
});
export type updateLogKeysResponseType = z.infer<typeof UpdateLogKeysResponseSchema>;

// Chat Log Item Schema (based on AppChatLogSchema)
export const ChatLogItemSchema = z.object({
  _id: z.string().meta({ example: '68ad85a7463006c963799a05', description: '对话日志 ID' }),
  chatId: z.string().meta({ example: 'chat123', description: '对话 ID' }),
  title: z.string().nullish().meta({ example: '用户对话', description: '对话标题' }),
  customTitle: z.string().nullish().meta({ example: '自定义标题', description: '自定义对话标题' }),
  source: z.enum(ChatSourceEnum).meta({ example: ChatSourceEnum.api, description: '对话来源' }),
  sourceName: z.string().nullish().meta({ example: 'API调用', description: '来源名称' }),
  updateTime: z.coerce
    .date()
    .meta({ example: '2024-01-01T00:30:00.000Z', description: '更新时间' }),
  createTime: z.coerce
    .date()
    .nullish()
    .meta({ example: '2024-01-01T00:00:00.000Z', description: '创建时间' }),
  messageCount: IntSchema.nullish().meta({ example: 10, description: '消息数量' }),
  userGoodFeedbackCount: IntSchema.nullish().meta({ example: 3, description: '好评反馈数量' }),
  userBadFeedbackCount: IntSchema.nullish().meta({ example: 1, description: '差评反馈数量' }),
  customFeedbacksCount: IntSchema.nullish().meta({ example: 2, description: '自定义反馈数量' }),
  markCount: IntSchema.nullish().meta({ example: 0, description: '标记数量' }),
  averageResponseTime: NumSchema.nullish().meta({
    example: 1500,
    description: '平均响应时间(毫秒)'
  }),
  errorCount: IntSchema.nullish().meta({ example: 0, description: '错误次数' }),
  totalPoints: NumSchema.nullish().meta({ example: 150.5, description: '总积分消耗' }),
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
  unreadOnly: BoolSchema.optional().meta({
    example: false,
    description: '是否仅显示未读反馈（当 feedbackType 为 all 时忽略）'
  }),
  errorFilter: z.enum(['all', 'has_error']).optional().meta({
    example: 'has_error',
    description: '报错筛选：all-全部记录，has_error-仅看报错'
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
  outLinkUids: z
    .array(z.string())
    .optional()
    .meta({
      example: ['user123', 'user456'],
      description: '外部用户 ID 列表'
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
    total: NumSchema.meta({ example: 100, description: '总记录数' }),
    list: z.array(ChatLogItemSchema).meta({
      description: '对话日志记录列表'
    })
  })
  .meta({ example: { total: 100, list: [] }, description: '应用对话日志列表' });
export type getAppChatLogsResponseType = z.infer<typeof GetAppChatLogsResponseSchema>;

export const ExportChatLogsResponseSchema = z.string().meta({
  description: '导出的 CSV 文件内容'
});
export type exportChatLogsResponseType = z.infer<typeof ExportChatLogsResponseSchema>;

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
  sourcesMap: z
    .record(
      z.string(),
      z.object({
        label: z.string().meta({
          example: 'API',
          description: '来源在导出文件中的展示名称'
        })
      })
    )
    .meta({
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
  dateStart: z.coerce.date().meta({
    example: '2024-01-01T00:00:00.000Z',
    description: '开始日期'
  }),
  dateEnd: z.coerce.date().meta({
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
  offset: NumSchema.optional().default(1).meta({
    example: 1,
    description: '用户留存偏移量，单位随 userTimespan 变化；未传时默认 1'
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
  timestamp: NumSchema.meta({ example: 1704067200, description: '时间戳' }),
  summary: z
    .object({
      userCount: NumSchema.meta({ example: 100, description: '用户总数' }),
      newUserCount: NumSchema.meta({ example: 30, description: '新用户数' }),
      retentionUserCount: NumSchema.meta({ example: 70, description: '留存用户数' }),
      points: NumSchema.meta({ example: 1500, description: '积分消耗' }),
      sourceCountMap: z.record(z.string(), NumSchema).meta({
        example: { api: 50, web: 30, mobile: 20 },
        description: '各来源用户数量'
      })
    })
    .meta({
      description: '当前时间桶内的用户统计汇总'
    })
});
export type userStatsDataPoint = z.infer<typeof UserStatsDataPointSchema>;

// Chat Statistics Data Point (based on AppChatLogChatData)
export const ChatStatsDataPointSchema = z.object({
  timestamp: NumSchema.meta({ example: 1704067200, description: '时间戳' }),
  summary: z
    .object({
      chatItemCount: NumSchema.meta({ example: 500, description: '消息总数' }),
      chatCount: NumSchema.meta({ example: 100, description: '对话会话总数' }),
      errorCount: NumSchema.meta({ example: 5, description: '报错消息数量' }),
      points: NumSchema.meta({ example: 800, description: '积分消耗' })
    })
    .meta({
      description: '当前时间桶内的对话统计汇总'
    })
});
export type chatStatsDataPoint = z.infer<typeof ChatStatsDataPointSchema>;

// App Statistics Data Point (based on AppChatLogAppData)
export const AppStatsDataPointSchema = z.object({
  timestamp: NumSchema.meta({ example: 1704067200, description: '时间戳' }),
  summary: z
    .object({
      goodFeedBackCount: NumSchema.meta({ example: 25, description: '好评反馈数量' }),
      badFeedBackCount: NumSchema.meta({ example: 3, description: '差评反馈数量' }),
      chatCount: NumSchema.meta({ example: 100, description: '对话数量' }),
      totalResponseTime: NumSchema.meta({ example: 120000, description: '总响应时间(毫秒)' })
    })
    .meta({
      description: '当前时间桶内的应用效果统计汇总'
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
  totalUsers: NumSchema.meta({
    example: 1000,
    description: '总用户数'
  }),
  totalChats: NumSchema.meta({
    example: 5000,
    description: '总对话数'
  }),
  totalPoints: NumSchema.meta({
    example: 15000,
    description: '总积分消耗'
  })
});
export type getTotalDataResponse = z.infer<typeof GetTotalDataResponseSchema>;

/* Get log users */
export const GetLogUsersBodySchema = z.object({
  appId: z.string().meta({
    example: '68ad85a7463006c963799a05',
    description: '应用 ID'
  }),
  dateStart: z.string().meta({
    example: '2024-01-01T00:00:00.000Z',
    description: '开始时间'
  }),
  dateEnd: z.string().meta({
    example: '2024-12-31T23:59:59.999Z',
    description: '结束时间'
  }),
  searchKey: z.string().optional().meta({
    example: 'user',
    description: '搜索用户名'
  }),
  sources: z
    .array(z.string())
    .optional()
    .meta({
      example: ['online', 'share'],
      description: '来源筛选'
    })
});
export type GetLogUsersBody = z.infer<typeof GetLogUsersBodySchema>;

export const LogUserSchema = z.object({
  outLinkUid: z.string().nullable().meta({ example: 'outLink123', description: '外链用户 ID' }),
  tmbId: z.string().nullable().meta({ example: 'tmb123', description: '团队成员 ID' }),
  name: z.string().meta({ example: '用户名', description: '用户名称' }),
  avatar: z
    .string()
    .optional()
    .meta({ example: 'https://example.com/avatar.png', description: '头像' }),
  count: NumSchema.meta({ example: 10, description: '对话数量' })
});
export type LogUserType = z.infer<typeof LogUserSchema>;

export const GetLogUsersResponseSchema = z.object({
  list: z.array(LogUserSchema).meta({ description: '使用者列表' })
});
export type GetLogUsersResponse = z.infer<typeof GetLogUsersResponseSchema>;
