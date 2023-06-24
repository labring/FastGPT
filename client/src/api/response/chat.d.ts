import type { ChatPopulate, ModelSchema } from '@/types/mongoSchema';
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
  chatModel: ModelSchema['chat']['chatModel']; // 对话模型名
  history: ChatItemType[];
}

export interface InitShareChatResponse {
  maxContext: number;
  userAvatar: string;
  model: {
    name: string;
    avatar: string;
    intro: string;
  };
  chatModel: ModelSchema['chat']['chatModel']; // 对话模型名
}
