import { POST, GET, DELETE } from '@/web/common/api/request';
import type {
  GetHelperBotChatRecordsParamsType,
  DeleteHelperBotChatParamsType,
  GetHelperBotChatRecordsResponseType,
  GetHelperBotFilePresignParamsType,
  GetHelperBotFilePreviewParamsType
} from '@fastgpt/global/openapi/core/chat/helperBot/api';
import type { CreatePostPresignedUrlResult } from '@fastgpt/service/common/s3/type';

export const getHelperBotChatRecords = (data: GetHelperBotChatRecordsParamsType) =>
  GET<GetHelperBotChatRecordsResponseType>('/core/chat/helperBot/getRecords', data);

export const deleteHelperBotChatRecord = (data: DeleteHelperBotChatParamsType) =>
  DELETE('/core/chat/helperBot/deleteRecord', data);

export const getHelperBotFilePresign = (data: GetHelperBotFilePresignParamsType) =>
  POST<CreatePostPresignedUrlResult>('/core/chat/helperBot/getFilePresign', data);

export const getHelperBotFilePreview = (data: GetHelperBotFilePreviewParamsType) =>
  POST<string>('/core/chat/helperBot/getFilePreview', data);
