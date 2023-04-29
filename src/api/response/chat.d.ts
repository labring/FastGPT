import type { ChatPopulate, ModelSchema } from '@/types/mongoSchema';
import type { ChatItemType } from '@/types/chat';

export type InitChatResponse = {
  chatId: string;
  modelId: string;
  name: string;
  avatar: string;
  intro: string;
  chatModel: ModelSchema['chat']['chatModel']; // 对话模型名
  history: ChatItemType[];
};
