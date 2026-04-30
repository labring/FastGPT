export type WechatPollJobData = {
  shareId: string;
};

export type WechatReplyJobData = {
  shareId: string;
  userId: string;
  text: string;
  contextToken: string;
  lastMsgId: string;
};
