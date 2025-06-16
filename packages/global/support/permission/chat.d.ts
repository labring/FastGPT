type ShareChatAuthProps = {
  shareId?: string;
  outLinkUid?: string;
  token?: string;
};
type TeamChatAuthProps = {
  teamId?: string;
  teamToken?: string;
};
export type OutLinkChatAuthProps = ShareChatAuthProps & TeamChatAuthProps;
