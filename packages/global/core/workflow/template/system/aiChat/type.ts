import z from 'zod';
import { IntSchema } from '../../../../../common/zod';

export type AiChatQuoteRoleType = 'user' | 'system';

/** 普通 AI 对话的周期历史窗口；缺省时沿用 history 固定轮数。 */
export const ChatHistoryWindowSchema = z
  .object({
    min: IntSchema.max(50).meta({ description: '缩窗后保留的历史轮数', example: 6 }),
    max: IntSchema.max(50).meta({ description: '增长期间允许的最大历史轮数', example: 12 })
  })
  .refine(({ min, max }) => min <= max, {
    path: ['max'],
    message: 'Maximum history rounds must be at least the minimum'
  });
export type ChatHistoryWindowType = z.infer<typeof ChatHistoryWindowSchema>;
