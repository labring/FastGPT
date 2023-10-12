import type { InitChatResponse } from '@/global/core/api/chatRes.d';

export type InitShareChatResponse = {
  userAvatar: string;
  app: InitChatResponse['app'];
};
