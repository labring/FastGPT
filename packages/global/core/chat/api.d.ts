export type UpdateChatFeedbackProps = {
  appId: string;
  chatId: string;
  chatItemId: string;
  shareId?: string;
  outLinkUid?: string;
  userBadFeedback?: string;
  userGoodFeedback?: string;
};
