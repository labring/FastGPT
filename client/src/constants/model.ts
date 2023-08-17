import type { ShareChatEditType } from '@/types/app';
import type { AppSchema } from '@/types/mongoSchema';
import { useTranslation } from 'react-i18next';

const { t } = useTranslation();
export enum OpenAiChatEnum {
  'GPT35' = 'gpt-3.5-turbo',
  'GPT3516k' = 'gpt-3.5-turbo-16k',
  'FastAI-Plus' = 'gpt-4',
  'FastAI-Plus32k' = 'gpt-4-32k'
}

export const defaultApp: AppSchema = {
  _id: '',
  userId: 'userId',
  name: t('模型加载中'),
  type: 'basic',
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
  name: ''
};
