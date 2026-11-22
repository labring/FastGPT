import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getChatFileTypeByFilename } from '@fastgpt/global/core/chat/file/utils';
import type { WechatReplyItem, WechatReplyMedia } from '@fastgpt/dal/redis/bullmq/services/wechat';
import {
  WechatMessageItemType,
  WechatMessageType,
  type CDNMedia,
  type MessageItem,
  type WeixinMessage
} from './ilinkClient';

type ParsedMessageGroup = {
  userId: string;
  messageItems: WechatReplyItem[];
  contextToken: string;
  lastMsgId: string;
};

const getMediaSource = (media?: CDNMedia): WechatReplyMedia['source'] | undefined => {
  if (media?.full_url) return { url: media.full_url };
  if (media?.encrypt_query_param) return { encryptedQuery: media.encrypt_query_param };
};

const parseWechatMessageItem = (item: MessageItem): WechatReplyItem | undefined => {
  switch (item.type) {
    case WechatMessageItemType.TEXT:
    case WechatMessageItemType.VOICE: {
      // 语音当前只使用微信提供的转写文本。
      const text =
        item.type === WechatMessageItemType.TEXT ? item.text_item?.text : item.voice_item?.text;
      return text ? { text } : undefined;
    }
    case WechatMessageItemType.IMAGE: {
      const image = item.image_item;
      if (!image) return;
      const source = getMediaSource(image.media);
      if (!source) return;
      return {
        source,
        aesKey: image.media?.aes_key,
        imageAesKey: image.aeskey,
        fileType: ChatFileTypeEnum.image,
        defaultName: 'image'
      };
    }
    case WechatMessageItemType.FILE:
    case WechatMessageItemType.VIDEO: {
      const isFile = item.type === WechatMessageItemType.FILE;
      const resource = isFile ? item.file_item : item.video_item;
      const aesKey = resource?.media?.aes_key;
      if (!resource || !aesKey) return;
      const source = getMediaSource(resource.media);
      if (!source) return;
      return {
        source,
        aesKey,
        filename: resource.file_name,
        fileType: isFile ? getChatFileTypeByFilename(resource.file_name) : ChatFileTypeEnum.video,
        defaultName: isFile ? 'file' : 'video'
      };
    }
  }
};

/** 将 iLink 消息投影为回复任务所需的文本和附件，附件下载留给回复 Worker。 */
export const parseWechatMessageItems = (items: MessageItem[]): WechatReplyItem[] =>
  items.flatMap((item) => {
    const parsed = parseWechatMessageItem(item);
    return parsed ? [parsed] : [];
  });

/** 按发送人聚合可处理的消息，并保留最后一条消息的 ID 和最后一个有效的上下文 token。 */
export function groupMessagesByUser(msgs: WeixinMessage[]): ParsedMessageGroup[] {
  const groups = new Map<string, ParsedMessageGroup>();

  for (const msg of msgs) {
    if (msg.message_type !== WechatMessageType.USER) continue;

    if (msg.message_id === undefined) continue;
    const messageId = msg.message_id;

    const messageItems = parseWechatMessageItems(msg.item_list ?? []);
    if (messageItems.length === 0) continue;

    const userId = msg.from_user_id ?? 'unknown';
    const existing = groups.get(userId);

    if (existing) {
      existing.messageItems.push(...messageItems);
      existing.lastMsgId = messageId;
      if (msg.context_token) {
        existing.contextToken = msg.context_token;
      }
    } else {
      groups.set(userId, {
        userId,
        messageItems,
        contextToken: msg.context_token ?? '',
        lastMsgId: messageId
      });
    }
  }

  return Array.from(groups.values());
}
