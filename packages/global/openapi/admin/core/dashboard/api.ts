import { z } from 'zod';
import { UsageSourceEnum } from '../../../../support/wallet/usage/constants';

// Common query schema
export const GetDataChartsQuerySchema = z.object({
  startTime: z.string().meta({ description: '查询起始时间（ISO 8601 格式）' }),
  sources: z.array(z.enum(UsageSourceEnum)).optional().meta({ description: '使用来源筛选' })
});
export type GetDataChartsQueryType = z.infer<typeof GetDataChartsQuerySchema>;

// Get user form data response
export const RegisteredUserCountSchema = z.object({
  date: z.string().meta({ description: '注册日期' }),
  count: z.number().meta({ description: '该日期注册的用户数' })
});
export const GetUserFormDataResponseSchema = z.object({
  startUserCount: z.number().meta({ description: '起始时间之前的用户总数' }),
  registeredUserCount: z.array(RegisteredUserCountSchema).meta({ description: '用户注册时间序列' })
});
export type GetUserFormDataResponseType = z.infer<typeof GetUserFormDataResponseSchema>;

// Get Pays Form Data Response
export const OrderAmountSchema = z.object({
  date: z.string().meta({ description: '数据点日期' }),
  totalCount: z.number().meta({ description: '订单总数' }),
  successCount: z.number().meta({ description: '成功订单数' })
});
export const PayAmountSchema = z.object({
  date: z.string().meta({ description: '数据点日期' }),
  totalCount: z.number().meta({ description: '支付总金额' })
});
export const PayTeamSchema = z.object({
  date: z.string().meta({ description: '数据点日期' }),
  totalCount: z.number().meta({ description: '支付团队数' })
});
export const GetPaysFormDataResponseSchema = z.object({
  orderAmounts: z.array(OrderAmountSchema).meta({ description: '订单数量时间序列' }),
  payAmounts: z.array(PayAmountSchema).meta({ description: '支付金额时间序列' }),
  payTeams: z.array(PayTeamSchema).meta({ description: '支付团队时间序列' })
});
export type GetPaysFormDataResponseType = z.infer<typeof GetPaysFormDataResponseSchema>;

// Get chat form data response
export const ChatAmountSchema = z.object({
  date: z.string().meta({ description: '数据点日期' }),
  totalCount: z.number().meta({ description: '对话总数' })
});
export const ChatItemAmountSchema = z.object({
  date: z.string().meta({ description: '数据点日期' }),
  totalCount: z.number().meta({ description: '对话消息总数' }),
  averageCount: z.number().meta({ description: '每个对话的平均消息数' })
});
export const GetChatFormDataResponseSchema = z.object({
  chatAmounts: z.array(ChatAmountSchema).meta({ description: '对话数量时间序列' }),
  chatItemAmounts: z.array(ChatItemAmountSchema).meta({ description: '对话消息数量时间序列' })
});
export type GetChatFormDataResponseType = z.infer<typeof GetChatFormDataResponseSchema>;

// Get QPM range distribution response
export const QpmRangeSchema = z.object({
  range: z.string().meta({ description: 'QPM 范围标签' }),
  count: z.number().meta({ description: '范围内的团队数量' })
});
export const GetQpmRangeResponseSchema = z.object({
  ranges: z.array(QpmRangeSchema).meta({ description: 'QPM 范围统计列表' })
});
export type GetQpmRangeResponseType = z.infer<typeof GetQpmRangeResponseSchema>;

// Get cost form data response
export const PointUsageSchema = z.object({
  date: z.string().meta({ description: '数据点日期' }),
  totalCount: z.number().meta({ description: '积分使用总数' })
});
export const GetCostFormDataResponseSchema = z.object({
  pointUsages: z.array(PointUsageSchema).meta({ description: '积分使用时间序列' })
});
export type GetCostFormDataResponseType = z.infer<typeof GetCostFormDataResponseSchema>;

// Get user stats response
export const GetUserStatsResponseSchema = z.object({
  usersCount: z.number().meta({ description: '用户总数' }),
  rechargeCount: z.number().meta({ description: '充值总数' })
});
export type GetUserStatsResponseType = z.infer<typeof GetUserStatsResponseSchema>;

// Get app stats response
export const GetAppStatsResponseSchema = z.object({
  workflowCount: z.number().meta({ description: '工作流总数' }),
  simpleAppCount: z.number().meta({ description: '简易应用总数' }),
  workflowToolCount: z.number().meta({ description: '工作流工具总数' }),
  httpToolCount: z.number().meta({ description: 'HTTP 工具总数' }),
  mcpToolCount: z.number().meta({ description: 'MCP 工具总数' })
});
export type GetAppStatsResponseType = z.infer<typeof GetAppStatsResponseSchema>;

// Get dataset stats response
export const GetDatasetStatsResponseSchema = z.object({
  commonDatasetCount: z.number().meta({ description: '通用知识库总数' }),
  websiteDatasetCount: z.number().meta({ description: 'Web 站点同步总数' }),
  apiDatasetCount: z.number().meta({ description: 'API 知识库总数' }),
  yuqueDatasetCount: z.number().meta({ description: '语雀知识库总数' }),
  feishuDatasetCount: z.number().meta({ description: '飞书知识库总数' }),
  totalIndexCount: z.number().meta({ description: '索引总量' })
});
export type GetDatasetStatsResponseType = z.infer<typeof GetDatasetStatsResponseSchema>;
