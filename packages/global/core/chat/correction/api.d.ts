import type { CorrectionDataType, ChatCorrectionSchemaType } from './type';
import type { PaginationProps, PaginationResponse } from '../../../../web/common/fetch/type';
// Correction API Types
export type SubmitChatCorrectionParams = {
  appId: string;
  chatId: string;
  dataId: string;
  correctionData: CorrectionDataType;
};

export type SubmitChatCorrectionResponse = {
  correctionId: string;
};

export type ListChatCorrectionParams = PaginationProps<{
  appId: string;
  chatId?: string;
  dataId?: string;
  correctionId?: string;
  startTime?: string | Date;
  endTime?: string | Date;
}>;

export type ChatCorrectionListItem = {
  _id: string;
  dataId: string;
  chatId: string;
  appId: string;
  correctionData: CorrectionDataType;
  updateTime: Date;
  userName?: string;
};

export type ListChatCorrectionResponse = PaginationResponse<ChatCorrectionListItem>;

export type DeleteChatCorrectionParams = {
  appId: string;
  chatId?: string;
  correctionId: string;
};

export type DeleteChatCorrectionResponse = {};

// Quote Search API Types
export type GetKeywordQuoteParams = PaginationProps<{
  chatId: string;
  appId: string;
  keyword: string;

  // filter params
  datasetIds: string[];
  collectionIds?: string[];

  shareId?: string;
  outLinkUid?: string;
  teamId?: string;
  teamToken?: string;
}>;

export type GetKeywordQuoteResponse = {
  list: Array<{
    datasetDataId: string;
    q: string;
    a?: string;
    sourceName?: string;
    extractiveText?: string;
  }>;
  total: number; // 总条数，用于分页
};
