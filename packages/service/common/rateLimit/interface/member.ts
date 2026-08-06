import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { defineRateLimitInterface } from '../core';
import { RateLimitSceneEnum } from '../type';

export const MemberRateLimitPolicy = {
  GetLlmRequestRecord: 'get-llm-request-record',
  ChatAgentHelperCompletions: 'chat-agent-helper-completions',
  Transcriptions: 'transcriptions',
  RedeemCoupon: 'redeem-coupon',
  RefundBill: 'refund-bill',
  CreateBill: 'create-bill',
  ExportMembers: 'export-members',
  CheckPayResult: 'check-pay-result',
  ExportUsage: 'export-usage',
  ExportDataset: 'export-dataset',
  ExportChatLogs: 'export-chat-logs'
} as const;

type MemberRateLimitPolicy = (typeof MemberRateLimitPolicy)[keyof typeof MemberRateLimitPolicy];

type MemberRateLimitParams = {
  policy: MemberRateLimitPolicy;
  memberId: string;
};

/** 成员场景的额度统一在接口层维护，避免业务路由自行声明窗口或额度。 */
const memberRateLimitConfig = {
  // 查看单条 LLM 请求记录，避免高频查询明细。
  [MemberRateLimitPolicy.GetLlmRequestRecord]: { limit: 1, seconds: 1 },
  // Chat Agent 辅助生成，限制同一成员触发补全的频率。
  [MemberRateLimitPolicy.ChatAgentHelperCompletions]: { limit: 10, seconds: 60 },
  // 音频转写，限制同一成员提交语音识别任务的频率。
  [MemberRateLimitPolicy.Transcriptions]: { limit: 1, seconds: 1 },
  // 兑换优惠券，避免同一成员并发重复核销。
  [MemberRateLimitPolicy.RedeemCoupon]: { limit: 1, seconds: 1 },
  // 管理端退款；rootkey 请求按订单所属成员归组。
  [MemberRateLimitPolicy.RefundBill]: { limit: 1, seconds: 1 },
  // 创建支付订单，避免同一成员短时间重复下单。
  [MemberRateLimitPolicy.CreateBill]: { limit: 1, seconds: 1 },
  // 导出团队成员列表。
  [MemberRateLimitPolicy.ExportMembers]: { limit: 1, seconds: 60 },
  // 轮询支付结果，允许前端在一分钟内持续查询。
  [MemberRateLimitPolicy.CheckPayResult]: { limit: 60, seconds: 60 },
  // 导出用量明细。
  [MemberRateLimitPolicy.ExportUsage]: { limit: 1, seconds: 60 },
  // 导出知识库集合数据。
  [MemberRateLimitPolicy.ExportDataset]: { limit: 1, seconds: 60 },
  // 导出应用对话日志。
  [MemberRateLimitPolicy.ExportChatLogs]: { limit: 1, seconds: 60 }
} satisfies Record<MemberRateLimitPolicy, { limit: number; seconds: number }>;

const memberRateLimit = defineRateLimitInterface<MemberRateLimitParams>({
  scene: RateLimitSceneEnum.Member,
  policy: ({ policy }) => policy,
  failureMode: 'open',
  getKeySegments: ({ memberId }) => ['member', memberId],
  getLimit: ({ policy }) => memberRateLimitConfig[policy].limit,
  getWindowSeconds: ({ policy }) => memberRateLimitConfig[policy].seconds,
  createError: () => ERROR_ENUM.tooManyRequest
});

/** 按受约束的成员业务策略消费额度，超限时抛出统一请求频繁错误。 */
export const assertMemberRateLimit = memberRateLimit.assert;
