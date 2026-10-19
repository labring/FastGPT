import { getS3ChatSource } from '../../common/s3/sources/chat';
import { MongoChatItemResponse } from './chatItemResponseSchema';
import { MongoChatItem } from './chatItemSchema';
import { MongoChat } from './chatSchema';
import { buildChatSourceQuery, type ChatSourceParams } from './source';
import { assertChatAccess, type ChatAccessScope } from './auth';

export type DeleteChatResourcesBySourceParams = ChatSourceParams & {
  chatIds?: string[];
  /** 用户操作传入授权范围；资源删除任务省略，继续按整个 source 清理。 */
  scope?: ChatAccessScope;
};

type ChatResourceRecord = {
  chatId: string;
  teamId: string;
  tmbId: string;
  outLinkUid?: unknown;
};

const getChatResourceUid = (chat: ChatResourceRecord) => {
  const uid = chat.outLinkUid || chat.tmbId;
  return uid ? String(uid) : undefined;
};

const deleteChatFilesBySourcePrefix = async ({
  sourceType,
  sourceId,
  chatId,
  uId
}: Pick<DeleteChatResourcesBySourceParams, 'sourceType' | 'sourceId'> & {
  chatId?: string;
  uId?: string;
}) => {
  await getS3ChatSource().deleteChatFilesByPrefix({
    sourceType,
    sourceId,
    chatId,
    uId
  });
};

/**
 * 按统一 chat source 硬删除标准 chat 资源。
 *
 * 只处理 `chats`、`chatitems`、`chat_item_responses` 和 chat S3 文件。用户级 App
 * Sandbox 不跟单个 Chat 生命周期绑定；App logs、usage、inputGuide 也不属于本函数。
 */
export async function deleteChatResourcesBySource({
  sourceType,
  sourceId,
  chatIds,
  scope
}: DeleteChatResourcesBySourceParams) {
  if (chatIds && chatIds.length === 0) {
    // 显式传空数组表示没有目标 chat，不能退化为整 source 删除。
    return;
  }

  const sourceQuery = buildChatSourceQuery({
    sourceType,
    sourceId
  });
  const chatIdQuery = chatIds?.length ? { chatId: { $in: chatIds } } : {};
  const chatQuery = {
    ...sourceQuery,
    ...chatIdQuery
  };

  const rawChatList = (await MongoChat.find(chatQuery, 'chatId teamId tmbId outLinkUid').lean()) as
    | ChatResourceRecord[]
    | null;
  // 写入前校验整批归属，混入他人会话时整批拒绝。
  if (scope) {
    for (const chat of rawChatList ?? []) assertChatAccess({ chat, scope });
  }
  // 成员级授权必须先确认父会话归属；资源级授权仍可清理指定 ID 的历史孤立记录。
  if (scope?.tmbId !== undefined) {
    if (!rawChatList?.length) return;
    Object.assign(chatQuery, { chatId: { $in: rawChatList.map((chat) => chat.chatId) } });
  }
  const chatList = (() => {
    if (!chatIds?.length) return rawChatList || [];

    const chatMap = new Map((rawChatList || []).map((chat) => [chat.chatId, chat]));
    const seenChatIds = new Set<string>();

    return chatIds.flatMap((chatId) => {
      if (seenChatIds.has(chatId)) return [];
      seenChatIds.add(chatId);

      const chat = chatMap.get(chatId);
      return chat ? [chat] : [];
    });
  })();
  await MongoChatItemResponse.deleteMany(chatQuery);

  await MongoChatItem.deleteMany(chatQuery);
  // 子表不统一存储成员字段，使用已校验的 chatId 集合清理；主表写入仍约束授权范围。
  await MongoChat.deleteMany({ ...chatQuery, ...scope });

  if (!chatIds?.length && !scope) {
    await deleteChatFilesBySourcePrefix({
      sourceType,
      sourceId
    });
    return;
  }

  await Promise.all(
    chatList.map((chat) => {
      const uId = getChatResourceUid(chat);
      if (!uId) return Promise.resolve();

      return deleteChatFilesBySourcePrefix({
        sourceType,
        sourceId,
        chatId: chat.chatId,
        uId
      });
    })
  );
}
