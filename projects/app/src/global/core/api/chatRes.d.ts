import type { AppSchema } from '@/types/mongoSchema';
import type { ChatItemType } from '@/types/chat';
import { AppModuleItemType, VariableItemType } from '@/types/app';

export type InitChatResponse = {
  chatId: string;
  appId: string;
  app: {
    userGuideModule?: AppModuleItemType;
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
