import {
  WechatMessageItemType,
  WechatMessageType,
  type CDNMedia,
  type MessageItem,
  type WeixinMessage
} from './ilinkClient';

export type ParsedMessageGroup = {
  userId: string;
  items: MessageItem[];
  contextToken: string;
  lastMsgId: string;
};

const hasDownloadUrl = (media?: CDNMedia) => Boolean(media?.encrypt_query_param || media?.full_url);

/** 仅保留能够转换为 runtime query 的消息项，避免空 job 进入工作流。 */
export const isSupportedMessageItem = (item: MessageItem) => {
  if (item.type === WechatMessageItemType.TEXT) return Boolean(item.text_item?.text);
  if (item.type === WechatMessageItemType.VOICE) return Boolean(item.voice_item?.text);
  if (item.type === WechatMessageItemType.IMAGE) return hasDownloadUrl(item.image_item?.media);
  if (item.type === WechatMessageItemType.FILE) {
    return Boolean(item.file_item?.media?.aes_key && hasDownloadUrl(item.file_item.media));
  }
  if (item.type === WechatMessageItemType.VIDEO) {
    return Boolean(item.video_item?.media?.aes_key && hasDownloadUrl(item.video_item.media));
  }
  return false;
};

export function groupMessagesByUser(msgs: WeixinMessage[]): ParsedMessageGroup[] {
  const groups = new Map<string, ParsedMessageGroup>();

  for (const msg of msgs) {
    if (msg.message_type !== WechatMessageType.USER) continue;

    if (msg.message_id === undefined) continue;
    const messageId = msg.message_id;

    const items = (msg.item_list ?? []).filter(isSupportedMessageItem);
    if (items.length === 0) continue;

    const userId = msg.from_user_id ?? 'unknown';
    const existing = groups.get(userId);

    if (existing) {
      existing.items.push(...items);
      existing.lastMsgId = messageId;
      if (msg.context_token) {
        existing.contextToken = msg.context_token;
      }
    } else {
      groups.set(userId, {
        userId,
        items,
        contextToken: msg.context_token ?? '',
        lastMsgId: messageId
      });
    }
  }

  return Array.from(groups.values());
}
