import { OutLinkChatAuthProps } from '../../support/permission/chat';

export type UpdateChatFeedbackProps = OutLinkChatAuthProps & {
  appId: string;
  chatId: string;
  dataId: string;
  userBadFeedback?: string;
  userGoodFeedback?: string;
};
export type InitOutLinkChatProps = {
  chatId?: string;
  shareId: string;
  outLinkUid: string;
  token?: string;
};
