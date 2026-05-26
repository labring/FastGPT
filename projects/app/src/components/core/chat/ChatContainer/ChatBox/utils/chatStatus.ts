import { ChatGenerateStatusEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatSiteItemType } from '../type';

type ChatRoundStatusItem = Pick<ChatSiteItemType, 'obj' | 'status'>;

export const isChatRoundPending = ({
  isChatting,
  chatGenerateStatus,
  lastChat
}: {
  isChatting: boolean;
  chatGenerateStatus?: ChatGenerateStatusEnum;
  lastChat?: ChatRoundStatusItem;
}) => {
  if (isChatting) return true;
  if (chatGenerateStatus === ChatGenerateStatusEnum.generating) return true;
  return !!lastChat && lastChat.obj === ChatRoleEnum.AI && lastChat.status !== 'finish';
};
