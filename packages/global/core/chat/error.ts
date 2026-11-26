import { z } from 'zod';
import { ChatErrEnum } from '../../common/error/code/chat';
import { getErrResponse, UserError } from '../../common/error/utils';
import { MODERATION_BLOCKED_ERROR_MESSAGE } from '../plugin/moderation/constants';

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

/**
 * 对话轮次持久化前的入口内容审核拦截错误。
 *
 * 仅在 `preChatRound` 获取生成租约与创建数据库占位记录前抛出，通过固定业务 `statusText`
 * 明确标识本轮尚未创建任何持久化记录；运行中或输出阶段产生的审核拦截使用普通错误，前端不会误回滚已保存轮次。
 */
export class ChatEntryModerationError extends UserError {
  constructor(displayMessage: string = MODERATION_BLOCKED_ERROR_MESSAGE) {
    super(ChatErrEnum.chatEntryModerationBlocked, displayMessage);
    this.name = 'ChatEntryModerationError';
  }
}

/** 判断请求拒绝是否明确来自轮次创建前的入口内容审核拦截。 */
export const isChatEntryModerationError = (error: unknown): boolean => {
  if (error instanceof ChatEntryModerationError) return true;
  const errorResponse = getErrResponse(error);
  return (
    errorResponse === ChatErrEnum.chatEntryModerationBlocked ||
    errorResponse?.statusText === ChatErrEnum.chatEntryModerationBlocked
  );
};
