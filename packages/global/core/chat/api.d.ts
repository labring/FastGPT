export type UpdateChatFeedbackProps = {
  appId: string;
  chatId: string;
  dataId: string;
  shareId?: string;
  teamId?: string;
  teamToken?: string;
  outLinkUid?: string;
  userBadFeedback?: string;
  userGoodFeedback?: string;
};
