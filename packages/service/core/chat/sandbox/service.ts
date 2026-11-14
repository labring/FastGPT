import type { ClientSession } from '../../../common/mongo';
import { MongoChat } from '../chatSchema';
import { buildChatSourceQuery, type ChatSourceParams } from '../source';
import { isSkipSaveChatId } from '../utils/prepare';

/**
 * 在 Sandbox runtime 准备成功后，持久化会话曾启用 Sandbox 的事实。
 *
 * 只更新已存在的根会话，不创建记录或重写 metadata；无会话记录的运行（如单步调试、评测或显式跳过）不报错。
 */
export const markChatSandboxEnabled = async (
  { sourceType, sourceId, chatId, teamId }: ChatSourceParams & { chatId: string; teamId: string },
  session?: ClientSession
): Promise<void> => {
  if (!chatId || isSkipSaveChatId(chatId)) return;

  await MongoChat.updateOne(
    { ...buildChatSourceQuery({ sourceType, sourceId }), chatId, teamId },
    { $set: { 'summary.hasAgentSandbox': true } },
    { session }
  );
};
