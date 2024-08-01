import type { AppChatConfigType, AppTTSConfigType } from '@fastgpt/global/core/app/type.d';
import { AdminFbkType, ChatItemType } from '@fastgpt/global/core/chat/type';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat.d';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';

export type GetChatSpeechProps = {
  ttsConfig: AppTTSConfigType;
  input: string;
  shareId?: string;
};

/* ---------- chat ----------- */
export type InitChatProps = {
  appId?: string;
  chatId?: string;
  loadCustomFeedbacks?: boolean;
};
export type InitOutLinkChatProps = {
  chatId?: string;
  shareId: string;
  outLinkUid: string;
};
export type InitTeamChatProps = {
  teamId: string;
  appId: string;
  chatId?: string;
  teamToken: string;
};
export type InitChatResponse = {
  chatId?: string;
  appId: string;
  userAvatar?: string;
  title: string;
  variables: Record<string, any>;
  history: ChatItemType[];
  app: {
    chatConfig?: AppChatConfigType;
    chatModels?: string[];
    name: string;
    avatar: string;
    intro: string;
    canUse?: boolean;
    type: `${AppTypeEnum}`;
    pluginInputs: FlowNodeInputItemType[];
  };
};

/* ---------- history ----------- */
export type GetHistoriesProps = OutLinkChatAuthProps & {
  appId?: string;
};

export type UpdateHistoryProps = OutLinkChatAuthProps & {
  appId: string;
  chatId: string;
  title?: string;
  customTitle?: string;
  top?: boolean;
};

export type DelHistoryProps = OutLinkChatAuthProps & {
  appId: string;
  chatId: string;
};
export type ClearHistoriesProps = OutLinkChatAuthProps & {
  appId?: string;
};

/* -------- chat item ---------- */
export type DeleteChatItemProps = OutLinkChatAuthProps & {
  appId: string;
  chatId: string;
  contentId?: string;
};

export type AdminUpdateFeedbackParams = AdminFbkType & {
  appId: string;
  chatId: string;
  chatItemId: string;
};

export type CloseCustomFeedbackParams = {
  appId: string;
  chatId: string;
  chatItemId: string;
  index: number;
};
