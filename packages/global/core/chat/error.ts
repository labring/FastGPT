import { z } from 'zod';
import { ChatErrEnum } from '../../common/error/code/chat';

/** 发送被生成门禁拒绝时，返回当前服务端轮次的恢复信息；交互续跑复用最新 AI。 */
export const ChatGeneratingConflictDataSchema = z
  .object({
    responseChatItemId: z.string().min(1).optional().meta({
      description: '当前服务端生成轮次的 AI 消息 ID；被拒绝的新发送未创建消息，客户端应恢复此 ID',
      example: 'active-ai-response-id'
    }),
    reusePreviousAi: z.literal(true).optional().meta({
      description: '当前执行是复用最新 AI 消息的交互续跑；恢复前刷新记录，允许复用该 AI',
      example: true
    })
  })
  .refine((data) => !!data.responseChatItemId || data.reusePreviousAi === true);
export type ChatGeneratingConflictData = z.infer<typeof ChatGeneratingConflictDataSchema>;

/** 明确占用时携带恢复目标；该错误须在任何新消息写入前抛出。 */
export class ChatGeneratingConflictError extends Error {
  readonly data: ChatGeneratingConflictData;

  constructor(data: ChatGeneratingConflictData) {
    super(ChatErrEnum.chatIsGenerating);
    this.name = 'ChatGeneratingConflictError';
    this.data = ChatGeneratingConflictDataSchema.parse(data);
  }
}
