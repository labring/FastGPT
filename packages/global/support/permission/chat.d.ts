type ShareChatAuthProps = {
  shareId?: string;
  outLinkUid?: string;
};
type TeamChatAuthProps = {
  teamId?: string;
  teamToken?: string;
};
export type OutLinkChatAuthProps = ShareChatAuthProps & TeamChatAuthProps;
