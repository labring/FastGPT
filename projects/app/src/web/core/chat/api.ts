import { GET, POST, DELETE, PUT } from '@/web/common/api/request';
import type {
  ChatHistoryItemType,
  ChatHistoryItemResType,
  ChatSiteItemType,
  ChatItemType
} from '@fastgpt/global/core/chat/type.d';
import { getResDataQuery } from '@/pages/api/core/chat/getResData';
import type {
  CloseCustomFeedbackParams,
  InitChatProps,
  InitChatResponse,
  InitOutLinkChatProps,
  GetHistoriesProps,
  InitTeamChatProps
} from '@/global/core/chat/api.d';

import type {
  AdminUpdateFeedbackParams,
  ClearHistoriesProps,
  DelHistoryProps,
  DeleteChatItemProps,
  UpdateHistoryProps
} from '@/global/core/chat/api.d';
import { UpdateChatFeedbackProps } from '@fastgpt/global/core/chat/api';
import { AuthTeamTagTokenProps } from '@fastgpt/global/support/user/team/tag';
import { AppListItemType } from '@fastgpt/global/core/app/type';
import { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';
import type {
  getPaginationRecordsBody,
  getPaginationRecordsResponse
} from '@/pages/api/core/chat/getPaginationRecords';

/**
 * 获取初始化聊天内容
 */
export const getInitChatInfo = (data: InitChatProps) =>
  GET<InitChatResponse>(`/core/chat/init`, data);
export const getInitOutLinkChatInfo = (data: InitOutLinkChatProps) =>
  GET<InitChatResponse>(`/core/chat/outLink/init`, data);
export const getTeamChatInfo = (data: InitTeamChatProps) =>
  GET<InitChatResponse>(`/core/chat/team/init`, data);

/**
 * get current window history(appid or shareId)
 */
export const getChatHistories = (data: PaginationProps<GetHistoriesProps>) =>
  POST<PaginationResponse<ChatHistoryItemType>>('/core/chat/getHistories', data);
/**
 * get detail responseData by dataId appId chatId
 */
export const getChatResData = (data: getResDataQuery) =>
  GET<ChatHistoryItemResType[]>(`/core/chat/getResData`, data);

export const getChatRecords = (data: getPaginationRecordsBody) =>
  POST<getPaginationRecordsResponse>('core/chat/getPaginationRecords', data);

/**
 * delete one history
 */
export const delChatHistoryById = (data: DelHistoryProps) => DELETE(`/core/chat/delHistory`, data);
/**
 * clear all history by appid
 */
export const delClearChatHistories = (data: ClearHistoriesProps) =>
  DELETE(`/core/chat/clearHistories`, data);

/**
 * delete one chat record
 */
export const delChatRecordById = (data: DeleteChatItemProps) =>
  DELETE(`/core/chat/item/delete`, data);

/**
 * 修改历史记录: 标题/置顶
 */
export const putChatHistory = (data: UpdateHistoryProps) => PUT('/core/chat/updateHistory', data);

/* -------------- feedback ------------ */
export const updateChatUserFeedback = (data: UpdateChatFeedbackProps) =>
  POST('/core/chat/feedback/updateUserFeedback', data);

export const updateChatAdminFeedback = (data: AdminUpdateFeedbackParams) =>
  POST('/core/chat/feedback/adminUpdate', data);

export const closeCustomFeedback = (data: CloseCustomFeedbackParams) =>
  POST('/core/chat/feedback/closeCustom', data).catch();

/* team chat */
/**
 * Get the app that can be used with this token
 */
export const getMyTokensApps = (data: AuthTeamTagTokenProps) =>
  GET<AppListItemType[]>(`/proApi/support/user/team/tag/getAppsByTeamTokens`, data);

/**
 * 获取团队分享的对话列表 initTeamChat
 * @param data
 * @returns
 */
export const getinitTeamChat = (data: { teamId: string; authToken: string; appId: string }) =>
  GET(`/proApi/core/chat/initTeamChat`, data);
