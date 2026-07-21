import { getS3ChatSource } from '../../common/s3/sources/chat';
import { MongoChatItemResponse } from './chatItemResponseSchema';
import { MongoChatItem } from './chatItemSchema';
import { MongoChat } from './chatSchema';
import { buildChatSourceQuery, type ChatSourceParams } from './source';

export type DeleteChatResourcesBySourceParams = ChatSourceParams & {
  chatIds?: string[];
};

type ChatResourceRecord = {
  chatId: string;
  tmbId?: unknown;
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
  chatIds
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

  const rawChatList = (await MongoChat.find(chatQuery, 'chatId tmbId outLinkUid').lean()) as
    | ChatResourceRecord[]
    | null;
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
  await MongoChat.deleteMany(chatQuery);

  if (!chatIds?.length) {
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
