import type { ChatPopulate, AppSchema } from '@/types/mongoSchema';
import type { ChatItemType } from '@/types/chat';

export interface InitChatResponse {
  chatId: string;
  modelId: string;
  systemPrompt?: string;
  limitPrompt?: string;
  model: {
    name: string;
    avatar: string;
    intro: string;
    canUse: boolean;
  };
  chatModel: AppSchema['chat']['chatModel']; // 对话模型名
  history: ChatItemType[];
}

export interface InitShareChatResponse {
  maxContext: number;
  userAvatar: string;
  appId: string;
  model: {
    name: string;
    avatar: string;
    intro: string;
  };
  chatModel: AppSchema['chat']['chatModel']; // 对话模型名
}
