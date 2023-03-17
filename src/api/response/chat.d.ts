import type { ChatPopulate, ModelSchema } from '@/types/mongoSchema';
import type { ChatItemType } from '@/types/chat';

export type InitChatResponse = {
  chatId: string;
  modelId: string;
  name: string;
  avatar: string;
  secret: ModelSchema.secret;
  chatModel: ModelSchema.service.ChatModel; // 模型名
  history: ChatItemType[];
  isExpiredTime: boolean;
};
