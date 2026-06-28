import type {
  DeleteChatRecordBodyType,
  GetQuoteBodyType,
  GetQuoteResponseType,
  GetCollectionQuoteBodyType,
  GetCollectionQuoteResType,
  GetRecordsV2BodyType,
  GetRecordsV2ResponseType,
  GetResDataQueryType
} from '@fastgpt/global/openapi/core/chat/record/api';
import { GET, POST, DELETE } from '@/web/common/api/request';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { toChatAuthQueryInput } from '@/web/core/chat/utils';

/**
 * get detail responseData by dataId, chat target and chatId
 */
export const getChatResData = (data: GetResDataQueryType) =>
  GET<ChatHistoryItemResType[]>(`/core/chat/record/getResData`, toChatAuthQueryInput(data));

export const getChatRecords = (data: GetRecordsV2BodyType) =>
  POST<GetRecordsV2ResponseType>('/core/chat/record/getRecords_v2', data);

// delete one chat record
export const delChatRecordById = (data: DeleteChatRecordBodyType) =>
  DELETE(`/core/chat/record/delete`, toChatAuthQueryInput(data), { dataAsBody: true });

export const getQuoteDataList = (data: GetQuoteBodyType) =>
  POST<GetQuoteResponseType>(`/core/chat/record/getQuote`, data);

export const getCollectionQuote = (data: GetCollectionQuoteBodyType) =>
  POST<GetCollectionQuoteResType>(`/core/chat/record/getCollectionQuote`, data);
