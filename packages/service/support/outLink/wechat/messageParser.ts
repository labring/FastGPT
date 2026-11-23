import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getChatFileTypeByFilename } from '@fastgpt/global/core/chat/file/utils';
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

export type WechatMediaResource = {
  media: CDNMedia;
  imageAesKey?: string;
  filename?: string;
  fileType: ChatFileTypeEnum;
  defaultName: 'image' | 'file' | 'video';
};

type ParsedWechatItem = { text: string } | WechatMediaResource;

const hasDownloadUrl = (media?: CDNMedia): media is CDNMedia =>
  Boolean(media?.encrypt_query_param || media?.full_url);

/** 入队与消费共用消息项解析规则，媒体字段始终从声明的消息类型读取。 */
export const parseWechatMessageItem = (item: MessageItem): ParsedWechatItem | undefined => {
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
      if (!image || !hasDownloadUrl(image.media)) return;
      return {
        media: image.media,
        imageAesKey: image.aeskey,
        fileType: ChatFileTypeEnum.image,
        defaultName: 'image'
      };
    }
    case WechatMessageItemType.FILE:
    case WechatMessageItemType.VIDEO: {
      const isFile = item.type === WechatMessageItemType.FILE;
      const resource = isFile ? item.file_item : item.video_item;
      if (!resource || !resource.media?.aes_key || !hasDownloadUrl(resource.media)) return;
      return {
        media: resource.media,
        filename: resource.file_name,
        fileType: isFile ? getChatFileTypeByFilename(resource.file_name) : ChatFileTypeEnum.video,
        defaultName: isFile ? 'file' : 'video'
      };
    }
  }
};

export function groupMessagesByUser(msgs: WeixinMessage[]): ParsedMessageGroup[] {
  const groups = new Map<string, ParsedMessageGroup>();

  for (const msg of msgs) {
    if (msg.message_type !== WechatMessageType.USER) continue;

    if (msg.message_id === undefined) continue;
    const messageId = msg.message_id;

    const items = (msg.item_list ?? []).filter(
      (item) => parseWechatMessageItem(item) !== undefined
    );
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
