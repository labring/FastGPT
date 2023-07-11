import type { AppSchema } from '@/types/mongoSchema';
import type { ChatItemType } from '@/types/chat';
import { VariableItemType } from '@/types/app';

export interface InitChatResponse {
  historyId: string;
  appId: string;
  app: {
    variableModules?: VariableItemType[];
    welcomeText?: string;
    name: string;
    avatar: string;
    intro: string;
    canUse: boolean;
  };
  title: string;
  variables: Record<string, any>;
  history: ChatItemType[];
}

export interface InitShareChatResponse {
  userAvatar: string;
  maxContext: number;
  app: {
    variableModules?: VariableItemType[];
    welcomeText?: string;
    name: string;
    avatar: string;
    intro: string;
  };
}
