import type { ShareChatEditType } from '@/types/app';
import type { AppSchema } from '@/types/mongoSchema';

export enum OpenAiChatEnum {
  'GPT35' = 'gpt-3.5-turbo',
  'GPT3516k' = 'gpt-3.5-turbo-16k',
  'FastAI-Plus' = 'gpt-4',
  'FastAI-Plus32k' = 'gpt-4-32k'
}

export const defaultApp: AppSchema = {
  _id: '',
  userId: 'userId',
  name: '模型名称',
  avatar: '/icon/logo.png',
  intro: '',
  updateTime: Date.now(),
  share: {
    isShare: false,
    isShareDetail: false,
    collection: 0
  },
  modules: []
};

export const defaultShareChat: ShareChatEditType = {
  name: '',
  maxContext: 5
};
