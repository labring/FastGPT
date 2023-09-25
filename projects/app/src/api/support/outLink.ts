import { GET, POST, DELETE } from '../request';
import type { InitShareChatResponse } from '../response/chat';
import type { OutLinkEditType } from '@/types/support/outLink';
import type { OutLinkSchema } from '@/types/support/outLink';

/**
 * 初始化分享聊天
 */
export const initShareChatInfo = (data: { shareId: string; authToken?: string }) =>
  GET<InitShareChatResponse>(`/support/outLink/init`, data);

/**
 * create a shareChat
 */
export const createShareChat = (
  data: OutLinkEditType & {
    appId: string;
    type: OutLinkSchema['type'];
  }
) => POST<string>(`/support/outLink/create`, data);

export const putShareChat = (data: OutLinkEditType) =>
  POST<string>(`/support/outLink/update`, data);

/**
 * get shareChat
 */
export const getShareChatList = (appId: string) =>
  GET<OutLinkSchema[]>(`/support/outLink/list`, { appId });

/**
 * delete a  shareChat
 */
export const delShareChatById = (id: string) => DELETE(`/support/outLink/delete?id=${id}`);
