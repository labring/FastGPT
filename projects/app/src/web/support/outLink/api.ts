import type {
  ChatVisibilityConfigQuery,
  ChatVisibilityConfigResponse
} from '@/pages/api/support/outLink/chat/config';
import type { UpdateChatVisibilityConfigBody } from '@/pages/api/support/outLink/chat/update';
import { GET, POST, DELETE } from '@/web/common/api/request';
import type {
  OutlinkAppType,
  OutLinkEditType,
  OutLinkSchema
} from '@fastgpt/global/support/outLink/type.d';

// create a shareChat
export function createShareChat<T>(
  data: OutLinkEditType<T> & {
    appId: string;
    type: OutLinkSchema['type'];
  }
) {
  return POST<string>(`/support/outLink/create`, data);
}

export const putShareChat = (data: OutLinkEditType) =>
  POST<string>(`/support/outLink/update`, data);

// get shareChat
export function getShareChatList<T extends OutlinkAppType>(data: {
  appId: string;
  type: OutLinkSchema<T>['type'];
}) {
  return GET<OutLinkSchema<T>[]>(`/support/outLink/list`, data);
}

// delete a  shareChat
export function delShareChatById(id: string) {
  return DELETE(`/support/outLink/delete?id=${id}`);
}

// update a shareChat
export function updateShareChat<T extends OutlinkAppType>(data: OutLinkEditType<T>) {
  return POST<string>(`/support/outLink/update`, data);
}

export function getChatVisibilityConfig(data: ChatVisibilityConfigQuery) {
  return GET<ChatVisibilityConfigResponse>('/support/outLink/chat/config', data);
}

export function updateChatVisibilityConfig(data: UpdateChatVisibilityConfigBody) {
  return POST<string>(`/support/outLink/chat/update`, data);
}

// /**
//  * create a shareChat
//  */
// export const createWecomLinkChat = (
//   data: OutLinkConfigEditType & {
//     appId: string;
//     type: OutLinkSchema['type'];
//   }
// ) => POST<string>(`/support/outLink/create`, data);
