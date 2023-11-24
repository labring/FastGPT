import { ModuleItemType } from '../module/type';
import { AdminFbkType, ChatItemType, moduleDispatchResType } from './type';

export type UpdateHistoryProps = {
  chatId: string;
  customTitle?: string;
  top?: boolean;
};

export type AdminUpdateFeedbackParams = AdminFbkType & {
  chatItemId: string;
};

export type InitChatResponse = {
  chatId: string;
  appId: string;
  app: {
    userGuideModule?: ModuleItemType;
    chatModels?: string[];
    name: string;
    avatar: string;
    intro: string;
    canUse?: boolean;
  };
  title: string;
  variables: Record<string, any>;
  history: ChatItemType[];
};

export type ChatHistoryItemResType = moduleDispatchResType & {
  moduleType: `${FlowNodeTypeEnum}`;
  moduleName: string;
};
