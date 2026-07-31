import type { MessageItem } from './ilinkClient';

export type WechatPollJobData = {
  shareId: string;
};

export type WechatReplyJobData = {
  shareId: string;
  userId: string;
  items?: MessageItem[];
  contextToken: string;
  lastMsgId: string;
};
