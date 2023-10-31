import type { AppSchema } from '@/types/mongoSchema';
import type { ChatItemType } from '@/types/chat';
import { VariableItemType } from '@/types/app';
import type { ModuleItemType } from '@fastgpt/global/core/module/type';

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
