import { GET, POST, DELETE } from '@/web/common/api/request';
import type { OutLinkEditType, OutLinkSchema } from '@fastgpt/global/support/outLink/type.d';

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
