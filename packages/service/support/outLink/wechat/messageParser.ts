import type { WeixinMessage } from './ilinkClient';

const MSG_TYPE_USER = 1;
const MSG_ITEM_TEXT = 1;
const MSG_ITEM_VOICE = 3;

export type ParsedMessageGroup = {
  userId: string;
  text: string;
  contextToken: string;
  msgIds: string[];
};

export function extractTextFromItem(item: NonNullable<WeixinMessage['item_list']>[number]): string {
  if (item.type === MSG_ITEM_TEXT && item.text_item?.text) {
    const text = item.text_item.text;
    if (item.ref_msg?.title) {
      return `[引用: ${item.ref_msg.title}]\n${text}`;
    }
    return text;
  }
  if (item.type === MSG_ITEM_VOICE && item.voice_item?.text) {
    return item.voice_item.text;
  }
  return '';
}

export function groupMessagesByUser(msgs: WeixinMessage[]): ParsedMessageGroup[] {
  const groups = new Map<string, ParsedMessageGroup>();

  for (const msg of msgs) {
    if (msg.message_type !== MSG_TYPE_USER) continue;

    let text = '';
    for (const item of msg.item_list ?? []) {
      const t = extractTextFromItem(item);
      if (t) {
        text = t;
        break;
      }
    }
    if (!text) continue;

    const userId = msg.from_user_id ?? 'unknown';

    const existing = groups.get(userId);
    if (existing) {
      existing.text += '\n' + text;
      existing.msgIds.push(msg.msgid);
      if (msg.context_token) {
        existing.contextToken = msg.context_token;
      }
    } else {
      groups.set(userId, {
        userId,
        text,
        contextToken: msg.context_token ?? '',
        msgIds: [msg.msgid]
      });
    }
  }

  return Array.from(groups.values());
}
