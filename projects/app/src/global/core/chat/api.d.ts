import type { AppChatConfigType, AppTTSConfigType, AppType } from '@fastgpt/global/core/app/type';
import type { AdminFbkType } from '@fastgpt/global/core/chat/type';
import { ChatItemType } from '@fastgpt/global/core/chat/type';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat.d';
import { RequestPaging } from '@/types';
import type { GetChatTypeEnum } from '@/global/core/chat/constants';
import type { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
export type GetChatSpeechProps = OutLinkChatAuthProps & {
  appId: string;
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

export type GetChatRecordsProps = OutLinkChatAuthProps & {
  appId: string;
  chatId?: string;
  loadCustomFeedbacks?: boolean;
  type?: `${GetChatTypeEnum}`;
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
  title?: string;
  variables?: Record<string, any>;
  app: {
    chatConfig?: AppChatConfigType;
    chatModels?: string[];
    name: string;
    avatar: string;
    intro: string;
    canUse?: boolean;
    type: AppType;
    pluginInputs: FlowNodeInputItemType[];
  };
};

/* ---------- history ----------- */
export type GetHistoriesProps = OutLinkChatAuthProps & {
  appId?: string;
  source?: `${ChatSourceEnum}`;

  startCreateTime?: string;
  endCreateTime?: string;
  startUpdateTime?: string;
  endUpdateTime?: string;
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
  appId: string;
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
  dataId: string;
};

export type CloseCustomFeedbackParams = {
  appId: string;
  chatId: string;
  dataId: string;
  index: number;
};
