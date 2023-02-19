import type { ModelType } from './model';
export interface ChatSiteType {
  name: string;
  avatar: string;
  modelId: string;
  chatModel: string;
  secret: ModelType.security;
}

export type ChatItemType = {
  obj: 'Human' | 'AI' | 'SYSTEM';
  value: string;
};
export type ChatSiteItemType = {
  status: 'loading' | 'finish';
} & ChatItemType;
