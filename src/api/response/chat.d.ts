import type { ChatPopulate, ModelSchema } from '@/types/mongoSchema';
import type { ChatItemType } from '@/types/chat';

export interface InitChatResponse {
  chatId: string;
  modelId: string;
  model: {
    name: string;
    avatar: string;
    intro: string;
    canUse: boolean;
  };
  chatModel: ModelSchema['chat']['chatModel']; // 对话模型名
  history: ChatItemType[];
}
