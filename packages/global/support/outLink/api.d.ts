import type { HistoryItemType } from '../../core/chat/type.d';
import { OutLinkSchema } from './type.d';

export type AuthOutLinkInitProps = {
  outLinkUid: string;
  tokenUrl?: string;
};
export type AuthOutLinkChatProps = { ip?: string | null; outLinkUid: string; question: string };
export type AuthOutLinkLimitProps = AuthOutLinkChatProps & { outLink: OutLinkSchema };
export type AuthOutLinkResponse = {
  uid: string;
};
export type AuthOutLinkProps = {
  shareId?: string;
  outLinkUid?: string;
};
