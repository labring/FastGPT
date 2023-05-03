import { ChatRoleEnum } from '@/constants/chat';

export type ChatItemSimpleType = {
  obj: `${ChatRoleEnum}`;
  value: string;
  systemPrompt?: string;
};
export type ChatItemType = {
  _id: string;
} & ChatItemSimpleType;
