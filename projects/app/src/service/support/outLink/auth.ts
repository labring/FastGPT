import { POST } from '@fastgpt/service/common/api/plusRequest';
import { OutLinkSchema } from '@fastgpt/global/support/outLink/type';

export type AuthLinkChatProps = { ip?: string | null; authToken?: string; question: string };
type AuthLinkLimitProps = AuthLinkChatProps & { outLink: OutLinkSchema };
type AuthShareChatInitProps = {
  authToken?: string;
  tokenUrl?: string;
};

export function authOutLinkLimit(data: AuthLinkLimitProps) {
  return POST('/support/outLink/authLimit', data);
}

export function authShareChatInit(data: AuthShareChatInitProps) {
  if (!global.feConfigs?.isPlus) return;
  return POST('/support/outLink/authShareChatInit', data);
}
