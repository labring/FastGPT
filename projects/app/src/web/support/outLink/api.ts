import type {
  GetPlaygroundVisibilityConfigParamsType,
  PlaygroundUpdateResponseType,
  UpdatePlaygroundVisibilityConfigParamsType
} from '@fastgpt/global/openapi/core/app/publishChannel/playground/api';
import type {
  OutLinkSchemaType as CoreOutLinkSchemaType,
  OutlinkAppType,
  PlaygroundVisibilityConfigType
} from '@fastgpt/global/support/outLink/type';
import type {
  OutLinkCreateBodyType,
  OutLinkCreateResponseType,
  OutLinkDeleteQueryType,
  OutLinkDeleteResponseType,
  OutLinkListQueryType,
  OutLinkListResponseType,
  OutLinkUpdateBodyType,
  OutLinkUpdateResponseType
} from '@fastgpt/global/openapi/support/outLink/api';
import { GET, POST, DELETE, PUT } from '@/web/common/api/request';

// create a shareChat
export function createShareChat(data: OutLinkCreateBodyType) {
  return POST<OutLinkCreateResponseType>(`/support/outLink/create`, data);
}

export const putShareChat = (data: OutLinkUpdateBodyType) =>
  PUT<OutLinkUpdateResponseType>(`/support/outLink/update`, data);

// get shareChat
export function getShareChatList(data: OutLinkListQueryType): Promise<OutLinkListResponseType>;
export function getShareChatList<T extends OutlinkAppType>(
  data: OutLinkListQueryType
): Promise<CoreOutLinkSchemaType<T>[]>;
export function getShareChatList(data: OutLinkListQueryType) {
  return GET<OutLinkListResponseType>(`/support/outLink/list`, data);
}

// delete a  shareChat
export function delShareChatById(id: OutLinkDeleteQueryType['id']) {
  return DELETE<OutLinkDeleteResponseType>(`/support/outLink/delete?id=${id}`);
}

// update a shareChat
export function updateShareChat(data: OutLinkUpdateBodyType) {
  return PUT<OutLinkUpdateResponseType>(`/support/outLink/update`, data);
}

export function getPlaygroundVisibilityConfig(data: GetPlaygroundVisibilityConfigParamsType) {
  return GET<PlaygroundVisibilityConfigType>('/support/outLink/playground/config', data);
}

export function updatePlaygroundVisibilityConfig(data: UpdatePlaygroundVisibilityConfigParamsType) {
  return PUT<PlaygroundUpdateResponseType>(`/support/outLink/playground/update`, data);
}

// /**
//  * create a shareChat
//  */
// export const createWecomLinkChat = (
//   data: OutLinkConfigEditType & {
//     appId: string;
//     type: OutLinkSchemaType['type'];
//   }
// ) => POST<string>(`/support/outLink/create`, data);
