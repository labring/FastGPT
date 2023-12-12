import type { AppTTSConfigType } from '@fastgpt/global/core/module/type.d';
import { ModuleItemType } from '../module/type';
import { AdminFbkType, ChatItemType, moduleDispatchResType } from '@fastgpt/global/core/chat/type';

export type GetChatSpeechProps = {
  ttsConfig: AppTTSConfigType;
  input: string;
  shareId?: string;
};

/* ---------- chat ----------- */
export type InitChatProps = {
  appId?: string;
  chatId?: string;
};
export type InitOutLinkChatProps = {
  chatId?: string;
  shareId?: string;
  outLinkUid?: string;
};
export type InitChatResponse = {
  chatId?: string;
  appId: string;
  userAvatar?: string;
  title: string;
  variables: Record<string, any>;
  history: ChatItemType[];
  app: {
    userGuideModule?: ModuleItemType;
    chatModels?: string[];
    name: string;
    avatar: string;
    intro: string;
    canUse?: boolean;
  };
};

/* ---------- history ----------- */
export type getHistoriesProps = {
  appId?: string;
  // share chat
  shareId?: string;
  outLinkUid?: string; // authToken/uid
};

export type UpdateHistoryProps = {
  appId: string;
  chatId: string;
  customTitle?: string;
  top?: boolean;
  shareId?: string;
  outLinkUid?: string;
};

export type DelHistoryProps = {
  appId: string;
  chatId: string;
  shareId?: string;
  outLinkUid?: string;
};
export type ClearHistoriesProps = {
  appId?: string;
  shareId?: string;
  outLinkUid?: string;
};

/* -------- chat item ---------- */
export type DeleteChatItemProps = {
  appId: string;
  chatId: string;
  contentId?: string;
  shareId?: string;
  outLinkUid?: string;
};

export type AdminUpdateFeedbackParams = AdminFbkType & {
  chatItemId: string;
};
