import { POST } from '@/web/common/api/request';
import type {
  GetFeedbackRecordIdsBodyType,
  GetFeedbackRecordIdsResponseType,
  UpdateUserFeedbackBodyType,
  UpdateFeedbackReadStatusBodyType,
  AdminUpdateFeedbackBodyType,
  CloseCustomFeedbackBodyType
} from '@fastgpt/global/openapi/core/chat/feedback/api';

/* Get feedback record IDs */
export const getFeedbackRecordIds = (data: GetFeedbackRecordIdsBodyType) =>
  POST<GetFeedbackRecordIdsResponseType>('/core/chat/feedback/getFeedbackRecordIds', data);

/* Update user feedback */
export const updateChatUserFeedback = (data: UpdateUserFeedbackBodyType) =>
  POST('/core/chat/feedback/updateUserFeedback', data);

/* Update admin feedback */
export const updateChatAdminFeedback = (data: AdminUpdateFeedbackBodyType) =>
  POST('/core/chat/feedback/adminUpdate', data);

/* Close custom feedback */
export const closeCustomFeedback = (data: CloseCustomFeedbackBodyType) =>
  POST('/core/chat/feedback/closeCustom', data).catch();

/* Update feedback read status */
export const updateFeedbackReadStatus = (data: UpdateFeedbackReadStatusBodyType) =>
  POST('/core/chat/feedback/updateFeedbackReadStatus', data);
