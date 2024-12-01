import { OutLinkChatAuthProps } from '../../support/permission/chat';

export type UpdateChatFeedbackProps = OutLinkChatAuthProps & {
  appId: string;
  chatId: string;
  dataId: string;
  userBadFeedback?: string;
  userGoodFeedback?: string;
};
