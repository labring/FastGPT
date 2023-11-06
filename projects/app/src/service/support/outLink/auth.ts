import { POST } from '@fastgpt/service/common/api/plusRequest';
import type {
  AuthLinkLimitProps,
  AuthShareChatInitProps
} from '@fastgpt/global/support/outLink/api.d';

export function authOutLinkLimit(data: AuthLinkLimitProps) {
  return POST('/support/outLink/authLimit', data);
}

export function authShareChatInit(data: AuthShareChatInitProps) {
  if (!global.feConfigs?.isPlus) return;
  return POST('/support/outLink/authShareChatInit', data);
}
